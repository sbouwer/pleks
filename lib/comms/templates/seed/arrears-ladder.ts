/**
 * lib/comms/templates/seed/arrears-ladder.ts — soft arrears EMAIL rungs (ADDENDUM_70E E3)
 *
 * Data:   the soft arrears reminder emails that sit directly below the locked LOD/final-notice,
 *         transcribed from the LIVE reminder.tsx (copy.*.1 / copy.*.2).
 * Notes:  ONLY reminder_step1/step2 have a real production email body. The other registry "ladder"
 *         keys (arrears.payment_reminder / payment_received / arrangement_confirm / resolved) have NO
 *         production email template — SMS/WhatsApp-first or bare-subject sends — so they are NOT folded
 *         (folding them would be net-new authoring, not transcription; pending a product decision).
 *         commsClass:"service" (transactional dunning, flavoured). §16: soft rungs carry no Tribunal;
 *         relative deadlines → {{deadlineDate}}. ⚠ §16 tone flags on the firm rungs preserved inline
 *         (live copy names the LOD step) for the ship-now legal pass. NOT seeded.
 */

import type { TemplateSeed } from "./types"

export const ARREARS_LADDER_SEEDS: TemplateSeed[] = [
  {
    key: "arrears.reminder_step1",
    channel: "email",
    commsClass: "service",
    name: "Arrears Reminder — Step 1",
    description: "First soft arrears reminder (rent overdue) — tone-flavoured. Email body of the SMS/WhatsApp-first nudge.",
    category: "arrears",
    subject: "Rent reminder: {{amountOwedDisplay}} overdue — {{propertyLabel}}",
    mergeFields: ["{{recipient.salutation}}", "{{propertyLabel}}", "{{amountOwedDisplay}}", "{{daysOverdue}}", "{{deadlineDate}}", "{{senderName}}", "{{branding.orgEmail}}"],
    legalReviewRef: "live: lib/comms/templates/tenant/arrears/reminder.tsx (copy.*.1)",
    variants: {
      friendly: [
        { type: "salutation", text: "{{recipient.salutation}}" },
        { type: "heading", text: "Friendly reminder — rent overdue" },
        { type: "paragraph", text: "We noticed that your rent for **{{propertyLabel}}** is {{amountOwedDisplay}} overdue ({{daysOverdue}} days). We know things can get busy, so this is just a quick heads-up to get things sorted." },
        { type: "dataBox", rows: [
          { label: "Property", value: "{{propertyLabel}}" },
          { label: "Amount outstanding", value: "{{amountOwedDisplay}}" },
          { label: "Days overdue", value: "{{daysOverdue}}" },
        ] },
        { type: "paragraph", text: "Please make payment by {{deadlineDate}} or reply to this email to let us know if you need to discuss arrangements. We are here to help." },
        { type: "paragraph", text: "If you have already made payment, please disregard this message. Contact {{branding.orgEmail}} to confirm allocation." },
        { type: "signoff", text: "Kind regards,\n{{senderName}}" },
      ],
      professional: [
        { type: "salutation", text: "{{recipient.salutation}}" },
        { type: "heading", text: "Rent payment overdue" },
        { type: "paragraph", text: "This is a notice that your rent for **{{propertyLabel}}** is {{amountOwedDisplay}} overdue, {{daysOverdue}} days past the due date. Please arrange payment by {{deadlineDate}}." },
        { type: "dataBox", rows: [
          { label: "Property", value: "{{propertyLabel}}" },
          { label: "Amount outstanding", value: "{{amountOwedDisplay}}" },
          { label: "Days overdue", value: "{{daysOverdue}}" },
        ] },
        { type: "paragraph", text: "If you have already processed payment, please confirm by replying to this email. If you are experiencing difficulties, please contact us to discuss a payment arrangement." },
        { type: "paragraph", text: "If you have already made payment, please disregard this message. Contact {{branding.orgEmail}} to confirm allocation." },
        { type: "signoff", text: "Kind regards,\n{{senderName}}" },
      ],
      firm: [
        { type: "salutation", text: "{{recipient.salutation}}" },
        { type: "heading", text: "NOTICE: Rent overdue" },
        { type: "paragraph", text: "Your rental account for **{{propertyLabel}}** reflects an overdue balance of {{amountOwedDisplay}} ({{daysOverdue}} days past due). Immediate payment is required." },
        { type: "dataBox", rows: [
          { label: "Property", value: "{{propertyLabel}}" },
          { label: "Amount outstanding", value: "{{amountOwedDisplay}}" },
          { label: "Days overdue", value: "{{daysOverdue}}" },
        ] },
        // ⚠ §16 tone flag (live copy): "formal escalation" threat on a soft step-1 rung — consequence language belongs on the signed LOD. Deadline: source "within 24 hours" → {{deadlineDate}} (R2).
        { type: "paragraph", text: "Failure to pay or contact us by {{deadlineDate}} will result in formal escalation. Payment plans are available but must be arranged by {{deadlineDate}}." },
        { type: "paragraph", text: "If you have already made payment, please disregard this message. Contact {{branding.orgEmail}} to confirm allocation." },
        { type: "signoff", text: "Kind regards,\n{{senderName}}" },
      ],
    },
  },
  {
    key: "arrears.reminder_step2",
    channel: "email",
    commsClass: "service",
    name: "Arrears Reminder — Step 2",
    description: "Second soft arrears reminder — escalated tone. The rung the cron renders as email (ArrearsReminderEmail step:2).",
    category: "arrears",
    subject: "Follow-up: {{amountOwedDisplay}} still outstanding — {{propertyLabel}}",
    mergeFields: ["{{recipient.salutation}}", "{{propertyLabel}}", "{{amountOwedDisplay}}", "{{daysOverdue}}", "{{deadlineDate}}", "{{senderName}}", "{{branding.orgEmail}}"],
    legalReviewRef: "live: lib/comms/templates/tenant/arrears/reminder.tsx (copy.*.2)",
    variants: {
      friendly: [
        { type: "salutation", text: "{{recipient.salutation}}" },
        { type: "heading", text: "Follow-up — rent still outstanding" },
        { type: "paragraph", text: "We are following up on our earlier reminder about the outstanding rent for **{{propertyLabel}}**. The overdue balance is {{amountOwedDisplay}} ({{daysOverdue}} days past due)." },
        { type: "dataBox", rows: [
          { label: "Property", value: "{{propertyLabel}}" },
          { label: "Amount outstanding", value: "{{amountOwedDisplay}}" },
          { label: "Days overdue", value: "{{daysOverdue}}" },
        ] },
        { type: "paragraph", text: "Please arrange payment by {{deadlineDate}} or contact us to discuss a payment plan. We value your tenancy and would like to resolve this quickly." },
        { type: "paragraph", text: "If you have already made payment, please disregard this message. Contact {{branding.orgEmail}} to confirm allocation." },
        { type: "signoff", text: "Kind regards,\n{{senderName}}" },
      ],
      professional: [
        { type: "salutation", text: "{{recipient.salutation}}" },
        { type: "heading", text: "Second notice — rent payment required" },
        // ⚠ §16 tone flag (live copy): "before formal steps are taken" — soft-rung escalation hint; keep consequence detail on the signed LOD.
        { type: "paragraph", text: "We write to advise that your rental account for **{{propertyLabel}}** remains {{amountOwedDisplay}} in arrears ({{daysOverdue}} days overdue). This is a second and final informal reminder before formal steps are taken." },
        { type: "dataBox", rows: [
          { label: "Property", value: "{{propertyLabel}}" },
          { label: "Amount outstanding", value: "{{amountOwedDisplay}}" },
          { label: "Days overdue", value: "{{daysOverdue}}" },
        ] },
        { type: "paragraph", text: "Payment is required by {{deadlineDate}}, or a payment arrangement must be agreed with us by {{deadlineDate}}." },
        { type: "paragraph", text: "If you have already made payment, please disregard this message. Contact {{branding.orgEmail}} to confirm allocation." },
        { type: "signoff", text: "Kind regards,\n{{senderName}}" },
      ],
      firm: [
        { type: "salutation", text: "{{recipient.salutation}}" },
        { type: "heading", text: "FINAL INFORMAL NOTICE — immediate payment required" },
        { type: "paragraph", text: "Despite a previous reminder, your rent of {{amountOwedDisplay}} for **{{propertyLabel}}** remains unpaid ({{daysOverdue}} days overdue). This is your final informal notice." },
        { type: "dataBox", rows: [
          { label: "Property", value: "{{propertyLabel}}" },
          { label: "Amount outstanding", value: "{{amountOwedDisplay}}" },
          { label: "Days overdue", value: "{{daysOverdue}}" },
        ] },
        // ⚠ §16 tone flag (live copy): "a formal letter of demand will follow" names the locked LOD rung from a soft email step (mirrors channels.ts whatsapp.arrears_final_notice). Tone-consistency item for the ship-now legal pass. Deadline: source "within 48 hours" → {{deadlineDate}} (R2).
        { type: "paragraph", text: "A formal letter of demand will follow if payment or a confirmed arrangement is not received by {{deadlineDate}}. Contact us before then to avoid further action." },
        { type: "paragraph", text: "If you have already made payment, please disregard this message. Contact {{branding.orgEmail}} to confirm allocation." },
        { type: "signoff", text: "Kind regards,\n{{senderName}}" },
      ],
    },
  },
]
