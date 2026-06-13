/**
 * lib/comms/templates/seed/statutory.ts — statutory templates folded into typed seeds (ADDENDUM_70E E3)
 *
 * Data:   the corrected (70B F-1) + standardized (70F) statutory bodies as TemplateBlock[].
 * Notes:  Statutory = sign-gated, NEVER flavoured (single body), citation-as-data. The substantive
 *         citation rides a cpaConditional block (final-notice) or an in-body line; the legalFooterSlot
 *         renders the ECTA stack (+ issuedUnder + POPIA where set). Folded from ADDENDUM_70C; this is
 *         the reviewable pre-store source, not yet seeded. Batch 1 (the two arrears notices) —
 *         remaining statutory + correspondence + service fold in alongside.
 */

import type { TemplateSeed } from "./types"

const ARREARS_MERGE = [
  "{{tenantName}}", "{{tenantAddress}}", "{{propertyLabel}}", "{{leaseStartDate}}",
  "{{amountOwedDisplay}}", "{{monthsInArrears}}", "{{oldestOutstandingDate}}",
  "{{referenceNumber}}", "{{today}}", "{{branding.orgName}}", "{{branding.orgPhone}}", "{{branding.orgEmail}}",
]

export const STATUTORY_SEEDS: TemplateSeed[] = [
  // ── Letter of Demand (contractual / common-law — NOT RHA s5(4), NOT CPA) ──────────
  {
    key: "arrears.letter_of_demand",
    channel: "email",
    commsClass: "statutory",
    name: "Letter of Demand",
    description: "Formal letter of demand for arrear rental (contractual / common-law).",
    category: "arrears",
    mergeFields: [...ARREARS_MERGE, "{{paymentDeadlineDays}}"],
    legalReviewRef: "ADDENDUM_70C §1.1 (corrected F-1 #3/#4)",
    popiaLine: true,
    body: [
      { type: "dataBox", rows: [
        { label: "Date", value: "{{today}}" },
        { label: "Reference", value: "{{referenceNumber}}" },
        { label: "Sent via", value: "Electronic communication (ECT Act 25 of 2002)" },
      ] },
      { type: "paragraph", text: "**{{tenantName}}**\n{{tenantAddress}}" },
      { type: "heading", text: "RE: LETTER OF DEMAND — ARREARS OF RENTAL" },
      { type: "paragraph", text: "{{propertyLabel}}" },
      { type: "divider" },
      { type: "salutation", text: "Dear {{tenantName}}," },
      { type: "paragraph", text: "We act on behalf of the landlord/managing agent of the above property. We write to formally demand payment of rental arrears outstanding under your lease agreement for **{{propertyLabel}}**, which commenced on {{leaseStartDate}}." },
      { type: "paragraph", text: "Despite previous reminders, the rental account reflects the following outstanding balance:" },
      { type: "dataBox", rows: [
        { label: "Tenant", value: "{{tenantName}}" },
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Overdue since", value: "{{oldestOutstandingDate}}" },
        { label: "Months in arrears", value: "{{monthsInArrears}}" },
        { label: "Total amount demanded", value: "{{amountOwedDisplay}}" },
      ] },
      { type: "heading", text: "FORMAL DEMAND" },
      { type: "paragraph", text: "We hereby formally demand that you pay the amount of **{{amountOwedDisplay}}** within **{{paymentDeadlineDays}} (seven) days** of the date of this letter." },
      { type: "paragraph", text: "In the event that payment is not received within the stipulated period, or a written payment arrangement is not agreed with us, the landlord reserves the right to:" },
      { type: "list", items: [
        "Cancel the lease agreement in accordance with the applicable clause of the Lease Agreement read with the Common Law;",
        "Apply to the Rental Housing Tribunal for an order against you;",
        "Institute proceedings in the Magistrate's Court for recovery of the outstanding amount, plus costs.",
      ] },
      { type: "paragraph", text: "This letter does not constitute a notice of cancellation of the lease. It is a formal demand for payment as required before legal proceedings may be instituted." },
      { type: "paragraph", text: "If you believe this demand is incorrect, or you have already made payment, please contact us **immediately** with proof of payment." },
      { type: "divider" },
      { type: "signoff", text: "Yours faithfully,\n**{{branding.orgName}}**\n{{branding.orgPhone}} · {{branding.orgEmail}}" },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Final Notice (CPA-conditional pre-cancellation — NOT RHA s5(4)) ──────────────
  {
    key: "arrears.final_notice",
    channel: "email",
    commsClass: "statutory",
    name: "Final Notice — Intended Cancellation",
    description: "Final pre-cancellation notice (CPA s14 / lex commissoria).",
    category: "arrears",
    mergeFields: [...ARREARS_MERGE, "{{cancellationNoticeDays}}"],
    legalReviewRef: "ADDENDUM_70C §1.2 (corrected F-1 #1/#2)",
    popiaLine: true,
    body: [
      { type: "dataBox", rows: [
        { label: "Date", value: "{{today}}" },
        { label: "Reference", value: "{{referenceNumber}}" },
        { label: "Sent via", value: "Electronic communication (ECT Act 25 of 2002)" },
      ] },
      { type: "callout", tone: "warn", text: "⚠ URGENT — FINAL NOTICE BEFORE LEASE CANCELLATION" },
      { type: "paragraph", text: "**{{tenantName}}**\n{{tenantAddress}}" },
      { type: "heading", text: "RE: FINAL NOTICE — INTENDED CANCELLATION OF LEASE AGREEMENT" },
      { type: "paragraph", text: "{{propertyLabel}}" },
      { type: "divider" },
      { type: "salutation", text: "Dear {{tenantName}}," },
      { type: "paragraph", text: "We refer to our previous letter of demand dated prior to today and note that the outstanding rental arrears for **{{propertyLabel}}** (lease commenced {{leaseStartDate}}) remain unpaid. This constitutes a material breach of your lease agreement." },
      { type: "dataBox", rows: [
        { label: "Tenant", value: "{{tenantName}}" },
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Overdue since", value: "{{oldestOutstandingDate}}" },
        { label: "Months in arrears", value: "{{monthsInArrears}}" },
        { label: "Total arrears", value: "{{amountOwedDisplay}}" },
      ] },
      { type: "heading", text: "NOTICE OF INTENDED CANCELLATION" },
      { type: "cpaConditional",
        ifCpa: "Pursuant to Section 14(2)(b)(ii) of the Consumer Protection Act 68 of 2008 read with the applicable clause of the Lease Agreement, this constitutes formal notice of the landlord's intention to cancel the lease agreement should the arrears of {{amountOwedDisplay}} not be paid in full, or a written payment arrangement not be agreed with us, within {{cancellationNoticeDays}} days of this notice.",
        otherwise: "Pursuant to the applicable clause of the Lease Agreement read with the Common Law, this constitutes formal notice of the landlord's intention to cancel the lease agreement should the arrears of {{amountOwedDisplay}} not be paid in full, or a written payment arrangement not be agreed with us, within {{cancellationNoticeDays}} days of this notice." },
      { type: "paragraph", text: "If the breach is not remedied within the period stated above, the landlord will be entitled to:" },
      { type: "list", items: [
        "Cancel the lease agreement and require you to vacate the premises;",
        "Apply to the Rental Housing Tribunal and/or the Magistrate's Court for an eviction order;",
        "Recover all outstanding amounts, holding-over damages, and legal costs from you.",
      ] },
      { type: "paragraph", text: "To avoid cancellation of your lease, you must either:" },
      { type: "list", items: [
        "(1) Pay the full amount of {{amountOwedDisplay}} before the deadline; or",
        "(2) Contact us **immediately** to enter into a written payment arrangement.",
      ] },
      { type: "paragraph", text: "This notice does not constitute cancellation of the lease. Cancellation will only occur after the expiry of the notice period without payment or arrangement." },
      { type: "divider" },
      { type: "signoff", text: "Yours faithfully,\n**{{branding.orgName}}**\n{{branding.orgPhone}} · {{branding.orgEmail}}" },
      { type: "legalFooterSlot" },
    ],
  },
]
