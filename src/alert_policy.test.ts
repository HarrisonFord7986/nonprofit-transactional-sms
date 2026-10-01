import assert from "node:assert/strict";
import test from "node:test";
import { alertRequestSchema, decideAlert } from "./alert_policy.js";

test("consent suppresses a donor receipt and keeps the amount out of sendable text", () => {
  const suppressed = alertRequestSchema.parse({
    kind: "donor_receipt",
    alertId: "receipt-2048",
    phone: "+14155550101",
    smsConsent: false,
    receiptId: "R-2048",
  });
  assert.deepEqual(decideAlert(suppressed), {
    action: "skip",
    alertId: "receipt-2048",
    reason: "no_sms_consent",
  });

  const sendable = decideAlert({ ...suppressed, smsConsent: true });
  assert.deepEqual(sendable, {
    action: "send",
    alertId: "receipt-2048",
    to: "+14155550101",
    text: "Thank you. Your donation receipt R-2048 is ready in the donor portal.",
  });
  assert.equal("amount" in suppressed, false);
});

test("campaign reporting produces a concrete staff update", () => {
  const input = alertRequestSchema.parse({
    kind: "campaign_report",
    alertId: "report-sept-29",
    phone: "+14155550102",
    smsConsent: true,
    campaignName: "Autumn clinic fund",
    giftsRecorded: 37,
  });
  const decision = decideAlert(input);
  assert.match(decision.action === "send" ? decision.text : "", /37 gifts recorded/);
});
