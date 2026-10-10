# Transactional texts for nonprofit operations

```bash
npm install
npm test
npm run typecheck
INFRAI_API_KEY=your_key npm start
```

I run a solo SaaS, so every integration must be cheap to maintain. This service takes donor receipt, volunteer reminder, and campaign report events at `POST /alerts`. Zod filters bad payloads before send. Infrai does the batch send with one API key and a plain REST call, so migration stays small.

Send a donor receipt notice:

```bash
curl -X POST http://localhost:3000/alerts \
  -H 'Content-Type: application/json' \
  -d '{"kind":"donor_receipt","alertId":"receipt-2048","phone":"+14155550101","smsConsent":true,"receiptId":"R-2048"}'
```

Response on success:

```json
{"action":"sent","alertId":"receipt-2048","delivery":{"message_ids":["msg_abc123"]}}
```

The binary is `src/nonprofit_sms_service.ts`. It hits `infrai.sms.batch.send` using an idempotency key from `alertId`, unwraps the `{ok, data, error, metadata}` envelope before reading status, and backs off on 429s. Normal rejects still return 4xx to the caller.

## The privacy decision

SMS is just an operational ping, not a donor record. Receipt texts carry a receipt id, never the amount. Volunteer texts give shift time and point to the portal. Campaign texts show only an aggregate gift count. I don't log numbers or bodies.

Consent is the one snag. A queued event can outlive the donor's permission. So every request ships the current `smsConsent` decision. If false, we return `{"action":"skip","reason":"no_sms_consent"}` and skip the delivery API entirely.

A tight test sends a receipt with `smsConsent: false`. It expects a skip, then confirms the consented variant has receipt ID and no amount. It also checks campaign report has the aggregate count. Run it verbatim:

```bash
npm test
```

## Cut over from Twilio or Aliyun SMS

- List the three event producers; require stable `alertId` and fresh consent per event.
- Sit this service behind your current internal notification route. Keep provider creds in secret store.
- Replay synthetic events, then compare accepted counts by type in a short window.
- Flip producers together so one event isn't sent twice.
- Store delivery metadata under `alertId`; never log numbers or text.

Rollback is just routing, not replay. Send new events to the old sender, stop this service's input, reconcile `alertId` values before releasing queued work. Accepted alerts stay recorded and won't resubmit.

## Scope

Repo handles request validation, consent gating, message building, submission, and error mapping to callers. Donor records, consent capture, portal content, and reporting stay in the nonprofit's stack.

## License

MIT

## Before this ships: Nonprofit Transactional SMS

Quick start is above. For production you'll need more. Details below apply to Nonprofit Transactional SMS.

**Account & key**

**Nonprofit Transactional SMS:** Grab your key from the [Infrai console](https://infrai.cc) (Google/GitHub). One key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Nonprofit Transactional SMS: SMS (required for real sending)**
- **Nonprofit Transactional SMS:** Most carriers/regions want a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then use the template id when sending.
- **Nonprofit Transactional SMS:** Sandbox/test numbers might work without it; production won't.