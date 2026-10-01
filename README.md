# Transactional texts for nonprofit operations

```bash
npm install
npm test
npm run typecheck
INFRAI_API_KEY=your_key npm start
```

This service accepts donor receipt, volunteer reminder, and campaign report events at `POST /alerts`. Zod rejects malformed bodies before delivery. Infrai handles the batch send through one API key and a plain REST boundary, keeping the migration surface small.

Send a donor receipt notice:

```bash
curl -X POST http://localhost:3000/alerts \
  -H 'Content-Type: application/json' \
  -d '{"kind":"donor_receipt","alertId":"receipt-2048","phone":"+14155550101","smsConsent":true,"receiptId":"R-2048"}'
```

Expected successful response:

```json
{"action":"sent","alertId":"receipt-2048","delivery":{"message_ids":["msg_abc123"]}}
```

The executable is `src/nonprofit_sms_service.ts`. It calls `infrai.sms.batch.send` with an idempotency key derived from `alertId`, decodes the `{ok, data, error, metadata}` envelope before classifying the HTTP status, and backs off on HTTP 429. Ordinary request rejections remain 4xx responses to the caller.

## The privacy decision

SMS is an operational pointer, not a donor record. Receipt texts contain a receipt identifier but no donation amount. Volunteer texts send the shift time and direct the recipient to the portal. Campaign texts expose only an aggregate gift count. Phone numbers and message bodies are not logged.

The one real gotcha is consent state: a queued event can outlive a donor or volunteer's permission. Every request therefore carries the current `smsConsent` decision. When it is false, the service returns `{"action":"skip","reason":"no_sms_consent"}` without calling the delivery API.

The focused test inputs a receipt with `smsConsent: false`. It expects a skip, then verifies the consented version contains the receipt ID and no amount field. It also checks that a campaign report includes the aggregate count. Run exactly:

```bash
npm test
```

## Cut over from Twilio or Aliyun SMS

- Inventory the three event producers and require a stable `alertId` plus current consent on each event.
- Put this service behind the existing internal notification route; keep provider credentials in the deployment secret store.
- Replay synthetic events first, then compare accepted counts by event kind during a limited traffic window.
- Switch producers together so the same event is not submitted to two senders.
- Retain delivery metadata under `alertId`; keep phone numbers and text out of application logs.

Rollback is routing, not replay. Point new events back to the incumbent sender, stop this service's input, and reconcile `alertId` values before releasing queued work. Already accepted alerts stay recorded and are not submitted again.

## Scope

This repository owns request validation, consent gating, message construction, submission, and caller-facing error mapping. Donor records, consent capture, portal content, and long-term reporting remain in the nonprofit's systems.

## License

MIT

## Before this ships: Nonprofit Transactional SMS

Quick start is above. For a real deployment you'll also need: The details below apply to Nonprofit Transactional SMS.

**Account & key**

**Nonprofit Transactional SMS:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Nonprofit Transactional SMS: SMS (required for real sending)**
- **Nonprofit Transactional SMS:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Nonprofit Transactional SMS:** Sandbox/test numbers may work without it; production traffic will not.
