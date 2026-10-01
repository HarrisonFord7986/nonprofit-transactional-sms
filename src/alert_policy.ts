import { z } from "zod";

const base = z.object({
  alertId: z.string().min(1).max(100),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  smsConsent: z.boolean(),
}).strict();

export const alertRequestSchema = z.discriminatedUnion("kind", [
  base.extend({
    kind: z.literal("donor_receipt"),
    receiptId: z.string().min(1).max(80),
  }).strict(),
  base.extend({
    kind: z.literal("volunteer_reminder"),
    shiftDate: z.string().datetime(),
  }).strict(),
  base.extend({
    kind: z.literal("campaign_report"),
    campaignName: z.string().min(1).max(80),
    giftsRecorded: z.number().int().nonnegative(),
  }).strict(),
]);

export type AlertRequest = z.infer<typeof alertRequestSchema>;
export type AlertDecision =
  | { action: "skip"; alertId: string; reason: "no_sms_consent" }
  | { action: "send"; alertId: string; to: string; text: string };

export function decideAlert(input: AlertRequest): AlertDecision {
  if (!input.smsConsent) {
    return { action: "skip", alertId: input.alertId, reason: "no_sms_consent" };
  }

  switch (input.kind) {
    case "donor_receipt":
      return {
        action: "send",
        alertId: input.alertId,
        to: input.phone,
        text: `Thank you. Your donation receipt ${input.receiptId} is ready in the donor portal.`,
      };
    case "volunteer_reminder":
      return {
        action: "send",
        alertId: input.alertId,
        to: input.phone,
        text: `Volunteer reminder: your shift starts ${input.shiftDate}. Check the volunteer portal for details.`,
      };
    case "campaign_report":
      return {
        action: "send",
        alertId: input.alertId,
        to: input.phone,
        text: `${input.campaignName} update: ${input.giftsRecorded} gifts recorded. Open the staff dashboard for the report.`,
      };
  }
}
