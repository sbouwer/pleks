/**
 * lib/comms/templates/seed/service.ts — service (transactional/system) templates as seeds (ADDENDUM_70E E3)
 *
 * Data:   transactional + internal comms (rent invoice/statement/receipt, emergency maintenance,
 *         info-request agent notifications, feedback) as TemplateBlock[].
 * Notes:  Service = NO popiaSlot, NO Tribunal, NO signatureSlot, NO legalFooterSlot. Dynamic per-instance
 *         line-items (invoice rows, statement entries, digest items) are represented with an info callout
 *         placeholder (the real arrays render per-send). Reviewable pre-store source — NOT seeded.
 */

import type { TemplateSeed } from "./types"

export const SERVICE_SEEDS: TemplateSeed[] = [
  // ── Urgent: critical maintenance issue (habitability) ────────────────────────────────────────
  {
    key: "maintenance.emergency",
    channel: "email",
    commsClass: "service",
    name: "Urgent: Critical Maintenance Issue",
    description: "Urgent habitability notice of a critical maintenance issue requiring immediate attention.",
    category: "maintenance",
    subject: "URGENT: Critical maintenance issue at {{propertyLabel}} — immediate attention required",
    mergeFields: ["{{recipient.salutation}}", "{{propertyLabel}}", "{{requestTitle}}", "{{urgencyReason}}", "{{contactName}}", "{{contactPhone}}", "{{senderName}}"],
    legalReviewRef: "ADDENDUM_70C §5.6",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "Urgent: critical maintenance issue" },
      { type: "callout", tone: "warn", text: "A critical maintenance issue has been identified at **{{propertyLabel}}** that requires immediate attention. Our team is actively working to resolve this." },
      { type: "dataBox", rows: [
        { label: "Request", value: "{{requestTitle}}" },
        { label: "Reason", value: "{{urgencyReason}}" },
      ] },
      { type: "paragraph", text: "If you have any safety concerns or need to vacate the affected area, please contact {{contactName}} on {{contactPhone}} immediately. Do not use any affected areas until further notice." },
      { type: "signoff", text: "Kind regards,\n{{senderName}}" },
    ],
  },

  // ── Rent (transactional) ─────────────────────────────────────────────────────────────────────
  {
    key: "rent.invoice_issued",
    channel: "email",
    commsClass: "service",
    name: "Monthly Rent Invoice",
    description: "Monthly rent invoice issued to the tenant.",
    category: "rent",
    subject: "Rent invoice {{invoiceNumber}} — {{totalAmountDisplay}} due {{dueDate}} — {{propertyLabel}}",
    mergeFields: ["{{recipient.salutation}}", "{{propertyLabel}}", "{{invoiceNumber}}", "{{invoiceDate}}", "{{periodFrom}}", "{{periodTo}}", "{{dueDate}}", "{{totalAmountDisplay}}", "{{paymentReference}}"],
    legalReviewRef: "ADDENDUM_70C §6.1",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "Monthly Rent Invoice" },
      { type: "paragraph", text: "Your rent invoice for **{{propertyLabel}}** has been issued. Please ensure payment is made before **{{dueDate}}**." },
      { type: "dataBox", rows: [
        { label: "Invoice", value: "{{invoiceNumber}}" },
        { label: "Invoice date", value: "{{invoiceDate}}" },
        { label: "Period", value: "{{periodFrom}} – {{periodTo}}" },
        { label: "Due date", value: "{{dueDate}}" },
      ] },
      { type: "callout", tone: "info", text: "The itemised line items for this invoice — rent plus any additional charges — render here per invoice." },
      { type: "dataBox", rows: [
        { label: "Total due", value: "{{totalAmountDisplay}}" },
        { label: "Payment reference", value: "{{paymentReference}}" },
      ] },
      { type: "paragraph", text: "Use this reference for all EFT payments to ensure your payment is allocated correctly. If you have any questions about this invoice, please contact your managing agent." },
      { type: "paragraph", text: "This invoice was generated automatically. Use your payment reference when making an EFT payment. Do not reply directly to this email." },
    ],
  },
  {
    key: "rent.monthly_statement",
    channel: "email",
    commsClass: "service",
    name: "Monthly Account Statement",
    description: "Monthly account statement (invoices, payments, closing balance).",
    category: "rent",
    subject: "Account statement — {{statementMonth}} — {{propertyLabel}} — Balance: {{closingBalanceDisplay}}",
    mergeFields: ["{{recipient.salutation}}", "{{propertyLabel}}", "{{statementMonth}}", "{{closingBalanceDisplay}}", "{{senderName}}"],
    legalReviewRef: "ADDENDUM_70C §6.2",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "Monthly Account Statement" },
      { type: "paragraph", text: "Please find your account statement for **{{statementMonth}}** for the property at {{propertyLabel}}." },
      { type: "callout", tone: "info", text: "Invoices for the period (invoice number · period — total · balance · status) and payments received (date — amount, method · receipt reference) render here per statement." },
      { type: "dataBox", rows: [
        { label: "Closing balance", value: "{{closingBalanceDisplay}}" },
      ] },
      { type: "paragraph", text: "If you have any queries about this statement, please contact {{senderName}}." },
      { type: "paragraph", text: "This statement is issued for informational purposes. Please retain a copy for your records." },
    ],
  },
  {
    key: "rent.payment_received",
    channel: "email",
    commsClass: "service",
    name: "Payment Received",
    description: "Payment receipt + remaining balance confirmation.",
    category: "rent",
    subject: "Payment confirmed — {{amountDisplay}} received for {{propertyLabel}}",
    mergeFields: ["{{recipient.salutation}}", "{{propertyLabel}}", "{{receiptNumber}}", "{{paymentDate}}", "{{paymentMethod}}", "{{invoiceNumber}}", "{{amountDisplay}}", "{{outstandingBalanceDisplay}}"],
    legalReviewRef: "ADDENDUM_70C §6.3",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "Payment Received" },
      { type: "paragraph", text: "Thank you — your payment for **{{propertyLabel}}** has been received and recorded." },
      { type: "dataBox", rows: [
        { label: "Receipt", value: "{{receiptNumber}}" },
        { label: "Date", value: "{{paymentDate}}" },
        { label: "Method", value: "{{paymentMethod}}" },
        { label: "Invoice", value: "{{invoiceNumber}}" },
        { label: "Amount received", value: "{{amountDisplay}}" },
        { label: "Outstanding balance", value: "{{outstandingBalanceDisplay}}" },
      ] },
      { type: "paragraph", text: "If your account is up to date, your balance is settled — thank you. If a balance of {{outstandingBalanceDisplay}} remains on your account, please arrange payment at your earliest convenience." },
      { type: "paragraph", text: "This is an automated receipt. If you believe there is an error, please contact your managing agent directly." },
    ],
  },

  // ── Info-request agent notifications (internal) ──────────────────────────────────────────────
  {
    key: "info_request.completion_notify",
    channel: "email",
    commsClass: "service",
    name: "Info Request — Reply Received (Agent Notification)",
    description: "Internal notification to the agent that an info-request response was submitted.",
    category: "info_requests",
    mergeFields: ["{{branding.orgName}}", "{{propertyLabel}}", "{{submitterDisplay}}", "{{topicLabel}}", "{{formUrl}}"],
    legalReviewRef: "ADDENDUM_70C §9.10",
    body: [
      { type: "heading", text: "Reply received" },
      { type: "paragraph", text: "{{submitterDisplay}} has submitted their response to the {{topicLabel}} request on {{propertyLabel}}." },
      { type: "paragraph", text: "The details have been captured against the property. Head to the property page to review what came in:" },
      { type: "cta", label: "Review the response", href: "{{formUrl}}" },
      { type: "paragraph", text: "No further action is needed from you unless the response triggers a downstream task (e.g. setting up debit orders once banking is confirmed)." },
      { type: "signoff", text: "Thanks,\n{{branding.orgName}}" },
    ],
  },
  {
    key: "info_request.self_track_nudge",
    channel: "email",
    commsClass: "service",
    name: "Info Request — Self-Track Nudge (Agent Notification)",
    description: "Internal nudge to the agent about an item they flagged to follow up on themselves.",
    category: "info_requests",
    mergeFields: ["{{branding.orgName}}", "{{propertyLabel}}", "{{daysElapsed}}", "{{topicLabel}}", "{{formUrl}}"],
    legalReviewRef: "ADDENDUM_70C §9.11",
    body: [
      { type: "heading", text: "Outstanding on your list" },
      { type: "paragraph", text: "About {{daysElapsed}} days ago you flagged that you'd follow up on the {{topicLabel}} for {{propertyLabel}} yourself." },
      { type: "paragraph", text: "If that's still on your list, the property page has the completeness widget ready to either log the details directly or forward a request to the owner:" },
      { type: "cta", label: "Open the property", href: "{{formUrl}}" },
      { type: "paragraph", text: "If this isn't relevant anymore, dismiss it from the widget and we won't nudge again." },
      { type: "signoff", text: "Thanks,\n{{branding.orgName}}" },
    ],
  },

  // ── Feedback (internal) ──────────────────────────────────────────────────────────────────────
  {
    key: "feedback.reply",
    channel: "email",
    commsClass: "service",
    name: "Feedback Reply",
    description: "Notification that the team replied to submitted feedback.",
    category: "feedback",
    mergeFields: ["{{subject}}", "{{replyBody}}", "{{threadUrl}}"],
    legalReviewRef: "ADDENDUM_70C §11.1",
    body: [
      { type: "heading", text: "We've replied to your feedback" },
      { type: "paragraph", text: "You submitted feedback: **{{subject}}**" },
      { type: "paragraph", text: "{{replyBody}}" },
      { type: "cta", label: "View feedback thread", href: "{{threadUrl}}" },
      { type: "paragraph", text: "You can view and continue the conversation from your account." },
    ],
  },
  {
    key: "feedback.daily_digest",
    channel: "email",
    commsClass: "service",
    name: "Feedback Daily Digest",
    description: "Daily roll-up of submitted feedback for the team inbox.",
    category: "feedback",
    mergeFields: ["{{date}}", "{{summary}}", "{{inboxUrl}}"],
    legalReviewRef: "ADDENDUM_70C §11.2",
    body: [
      { type: "heading", text: "Feedback digest — {{date}}" },
      { type: "paragraph", text: "{{summary}}" },
      { type: "callout", tone: "info", text: "Each feedback item — subject, then role · category · rating/5 ★ — renders here per digest." },
      { type: "cta", label: "Open feedback inbox", href: "{{inboxUrl}}" },
    ],
  },
]
