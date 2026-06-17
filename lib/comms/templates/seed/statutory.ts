/**
 * lib/comms/templates/seed/statutory.ts — statutory templates folded into typed seeds (ADDENDUM_70E E3)
 *
 * Data:   the corrected (70B F-1) + standardized (70F) statutory bodies as TemplateBlock[].
 * Notes:  Statutory = sign-gated, NEVER flavoured (single body), citation-as-data. The FINDING block
 *         (70F §3/§16 + O-15) is applied uniformly across the set:
 *           R1 POPIA line OMITTED on all statutory (none are data-collection/correspondence/lifecycle;
 *              adversarial notices must not offer a data-right they'll decline under litigation-hold).
 *           R2 absolute-dated deadline tokens ({{...Deadline}}/{{...ClosesAt}}) — never "within N days".
 *           R3 deposit refund timing = "within 14 days of restoration of the property" (O-15).
 *           R4 salutation via {{recipient.salutation}} (resolveRecipient, §9.3; statutory = formal register).
 *           R5 capacity statement stays wired-but-gated (legalFooterSlot) until counsel signs the wording.
 *         Folded from ADDENDUM_70C. Reviewable pre-store source — NOT seeded.
 */

import type { TemplateSeed } from "./types"

const ORG = ["{{branding.orgName}}", "{{branding.orgPhone}}", "{{branding.orgEmail}}"]
const RECIPIENT = ["{{recipient.salutation}}", "{{recipient.legal_name}}", "{{recipient.address}}"]
const SIGNOFF = "Yours faithfully,\n**{{branding.orgName}}**\n{{branding.orgPhone}} · {{branding.orgEmail}}"

export const STATUTORY_SEEDS: TemplateSeed[] = [
  // ── Letter of Demand — contractual / common-law (POPIA OMITTED; absolute deadline) ─────────
  {
    key: "arrears.letter_of_demand",
    channel: "email",
    commsClass: "statutory",
    name: "Letter of Demand",
    description: "Formal letter of demand for arrear rental (contractual / common-law).",
    category: "arrears",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{leaseStartDate}}", "{{amountOwedDisplay}}", "{{monthsInArrears}}", "{{oldestOutstandingDate}}", "{{referenceNumber}}", "{{today}}", "{{paymentDeadline}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §1.1 (F-1 #3/#4 · FINDING R1/R2/R4)",
    body: [
      { type: "dataBox", rows: [
        { label: "Date", value: "{{today}}" },
        { label: "Reference", value: "{{referenceNumber}}" },
        { label: "Sent via", value: "Electronic communication (ECT Act 25 of 2002)" },
      ] },
      { type: "paragraph", text: "**{{recipient.legal_name}}**\n{{recipient.address}}" },
      { type: "heading", text: "RE: LETTER OF DEMAND — ARREARS OF RENTAL" },
      { type: "paragraph", text: "{{propertyLabel}}" },
      { type: "divider" },
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "We act on behalf of the landlord/managing agent of the above property. We write to formally demand payment of rental arrears outstanding under your lease agreement for **{{propertyLabel}}**, which commenced on {{leaseStartDate}}." },
      { type: "paragraph", text: "Despite previous reminders, the rental account reflects the following outstanding balance:" },
      { type: "dataBox", rows: [
        { label: "Tenant", value: "{{recipient.legal_name}}" },
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Overdue since", value: "{{oldestOutstandingDate}}" },
        { label: "Months in arrears", value: "{{monthsInArrears}}" },
        { label: "Total amount demanded", value: "{{amountOwedDisplay}}" },
      ] },
      { type: "heading", text: "FORMAL DEMAND" },
      { type: "paragraph", text: "We hereby formally demand that you pay the amount of **{{amountOwedDisplay}}** by no later than **{{paymentDeadline}}**." },
      { type: "paragraph", text: "In the event that payment is not received by the date stated above, or a written payment arrangement is not agreed with us, the landlord reserves the right to:" },
      { type: "list", items: [
        "Cancel the lease agreement in accordance with the applicable clause of the Lease Agreement read with the Common Law;",
        "Apply to the Rental Housing Tribunal for an order against you;",
        "Institute proceedings in the Magistrate's Court for recovery of the outstanding amount, plus costs.",
      ] },
      { type: "paragraph", text: "This letter does not constitute a notice of cancellation of the lease. It is a formal demand for payment as required before legal proceedings may be instituted." },
      { type: "paragraph", text: "If you believe this demand is incorrect, or you have already made payment, please contact us **immediately** with proof of payment." },
      { type: "divider" },
      { type: "signoff", text: SIGNOFF },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Final Notice — CPA-conditional pre-cancellation (POPIA OMITTED; absolute deadline) ─────
  {
    key: "arrears.final_notice",
    channel: "email",
    commsClass: "statutory",
    name: "Final Notice — Intended Cancellation",
    description: "Final pre-cancellation notice (CPA s14 / lex commissoria).",
    category: "arrears",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{leaseStartDate}}", "{{amountOwedDisplay}}", "{{monthsInArrears}}", "{{oldestOutstandingDate}}", "{{referenceNumber}}", "{{today}}", "{{cancellationDeadline}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §1.2 (F-1 #1/#2 · FINDING R1/R2/R4)",
    body: [
      { type: "dataBox", rows: [
        { label: "Date", value: "{{today}}" },
        { label: "Reference", value: "{{referenceNumber}}" },
        { label: "Sent via", value: "Electronic communication (ECT Act 25 of 2002)" },
      ] },
      { type: "callout", tone: "warn", text: "⚠ URGENT — FINAL NOTICE BEFORE LEASE CANCELLATION" },
      { type: "paragraph", text: "**{{recipient.legal_name}}**\n{{recipient.address}}" },
      { type: "heading", text: "RE: FINAL NOTICE — INTENDED CANCELLATION OF LEASE AGREEMENT" },
      { type: "paragraph", text: "{{propertyLabel}}" },
      { type: "divider" },
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "We refer to our previous letter of demand dated prior to today and note that the outstanding rental arrears for **{{propertyLabel}}** (lease commenced {{leaseStartDate}}) remain unpaid. This constitutes a material breach of your lease agreement." },
      { type: "dataBox", rows: [
        { label: "Tenant", value: "{{recipient.legal_name}}" },
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Overdue since", value: "{{oldestOutstandingDate}}" },
        { label: "Months in arrears", value: "{{monthsInArrears}}" },
        { label: "Total arrears", value: "{{amountOwedDisplay}}" },
      ] },
      { type: "heading", text: "NOTICE OF INTENDED CANCELLATION" },
      { type: "cpaConditional",
        ifCpa: "Pursuant to Section 14(2)(b)(ii) of the Consumer Protection Act 68 of 2008 read with the applicable clause of the Lease Agreement, this constitutes formal notice of the landlord's intention to cancel the lease agreement should the arrears of {{amountOwedDisplay}} not be paid in full, or a written payment arrangement not be agreed with us, by no later than {{cancellationDeadline}}.",
        otherwise: "Pursuant to the applicable clause of the Lease Agreement read with the Common Law, this constitutes formal notice of the landlord's intention to cancel the lease agreement should the arrears of {{amountOwedDisplay}} not be paid in full, or a written payment arrangement not be agreed with us, by no later than {{cancellationDeadline}}." },
      { type: "paragraph", text: "If the breach is not remedied by the date stated above, the landlord will be entitled to:" },
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
      { type: "signoff", text: SIGNOFF },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Deposit return schedule — RHA s5(3)(g)+s5(7); 14 days of restoration (O-15) ─────────────
  {
    key: "deposit.return_schedule",
    channel: "email",
    commsClass: "statutory",
    name: "Deposit Return Schedule",
    description: "Itemised deposit deduction schedule (RHA s5(3)(g) read with s5(7)).",
    category: "deposits",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{leaseStartDate}}", "{{leaseEndDate}}", "{{depositHeldDisplay}}", "{{interestAccruedDisplay}}", "{{totalAvailableDisplay}}", "{{totalDeductionsDisplay}}", "{{refundToTenantDisplay}}", "{{disputeDeadline}}", "{{referenceNumber}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §3.3 (F-1 #5/#6 · O-15 · FINDING R2/R3/R4 · §16 Tribunal softened to contact-first)",
    issuedUnder: "This notice is issued pursuant to Section 5(7) of the Rental Housing Act 50 of 1999. Reference: {{referenceNumber}}. Landlord agent: {{branding.orgName}}. If you do not agree with these deductions, please contact us; you also have the right to refer the matter to the Rental Housing Tribunal.",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "DEPOSIT RETURN SCHEDULE" },
      { type: "paragraph", text: "Ref: {{referenceNumber}} · Property: {{propertyLabel}}" },
      { type: "paragraph", text: "In accordance with Section 5(3)(g) read with Section 5(7) of the Rental Housing Act 50 of 1999, please find below the itemised schedule of your deposit return. You have until **{{disputeDeadline}}** to dispute any deductions listed herein." },
      { type: "dataBox", rows: [
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Lease commenced", value: "{{leaseStartDate}}" },
        { label: "Lease ended", value: "{{leaseEndDate}}" },
      ] },
      { type: "dataBox", rows: [
        { label: "Deposit held", value: "{{depositHeldDisplay}}" },
        { label: "Interest accrued", value: "{{interestAccruedDisplay}}" },
        { label: "Total available", value: "{{totalAvailableDisplay}}" },
        { label: "Total deductions", value: "{{totalDeductionsDisplay}}" },
        { label: "Refund to tenant", value: "{{refundToTenantDisplay}}" },
      ] },
      { type: "callout", tone: "info", text: "Itemised damage deductions (each classified wear-and-tear vs damage and separately substantiated) and non-damage charges are set out in the schedule attached to this notice." },
      { type: "callout", tone: "warn", text: "Your right to dispute: if you dispute any deduction, you must notify us in writing before **{{disputeDeadline}}**. Disputes received after this date may not be considered. To dispute, reply to this email with your specific objections and supporting documentation (photographs, quotes, prior condition reports)." },
      { type: "paragraph", text: "The refund of **{{refundToTenantDisplay}}** will be processed within 14 days of restoration of the property, subject to no valid dispute being received. If a dispute is lodged, the disputed portion will be held pending resolution in accordance with Section 5(3)(g) read with Section 5(7) of the Rental Housing Act 50 of 1999." },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Deposit returned — RHA s5(3)(g)(i) ─────────────────────────────────────────────────────
  {
    key: "deposit.returned",
    channel: "email",
    commsClass: "statutory",
    name: "Deposit Refund Processed",
    description: "Deposit refund confirmation (RHA s5(3)(g)(i)).",
    category: "deposits",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{refundAmountDisplay}}", "{{referenceNumber}}", "{{disbursedDate}}", "{{bankDetails}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §3.6 (F-1 #8 · FINDING R4)",
    issuedUnder: "This notice is issued pursuant to Section 5(3)(g)(i) of the Rental Housing Act 50 of 1999. Reference: {{referenceNumber}}. Issued by: {{branding.orgName}}.",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "Deposit Refund Processed" },
      { type: "paragraph", text: "We confirm that your deposit refund has been processed and the funds have been transferred. Please allow 1–3 business days for the amount to reflect in your account." },
      { type: "dataBox", rows: [
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Refund amount", value: "{{refundAmountDisplay}}" },
        { label: "Payment reference", value: "{{referenceNumber}}" },
        { label: "Date processed", value: "{{disbursedDate}}" },
        { label: "Account", value: "{{bankDetails}}" },
      ] },
      { type: "paragraph", text: "This concludes the deposit return process for your tenancy at {{propertyLabel}}. The full itemised deduction schedule was previously communicated to you in the deposit return notice." },
      { type: "paragraph", text: "If you did not receive the refund within 3 business days, or if you have any questions about the settlement, please contact us at {{branding.orgEmail}}." },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Deposit interest statement — RHA s5(3)(d) (NCA struck) ──────────────────────────────────
  {
    key: "deposit.interest_statement",
    channel: "email",
    commsClass: "statutory",
    name: "Annual Deposit Interest Statement",
    description: "Annual deposit interest statement (RHA s5(3)(d)).",
    category: "deposits",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{periodFrom}}", "{{periodTo}}", "{{depositHeldDisplay}}", "{{effectiveRateDisplay}}", "{{interestThisPeriodDisplay}}", "{{cumulativeInterestDisplay}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §3.7 (F-1 #7 · FINDING R4)",
    issuedUnder: "Interest is calculated at the prescribed rate determined by the South African Reserve Bank (SARB) repo rate plus a margin, or such rate as agreed in your lease agreement. This statement is issued in accordance with Section 5(3)(d) of the Rental Housing Act 50 of 1999.",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "Annual Deposit Interest Statement" },
      { type: "paragraph", text: "Please find below your deposit interest statement for the period **{{periodFrom}}** to **{{periodTo}}** for the property at {{propertyLabel}}." },
      { type: "dataBox", rows: [
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Deposit held", value: "{{depositHeldDisplay}}" },
        { label: "Interest rate (effective p.a.)", value: "{{effectiveRateDisplay}}" },
        { label: "Interest accrued this period", value: "{{interestThisPeriodDisplay}}" },
        { label: "Cumulative interest to date", value: "{{cumulativeInterestDisplay}}" },
      ] },
      { type: "paragraph", text: "Your deposit and all accrued interest are held in our trust account and will be accounted for in full at the end of your tenancy. You are entitled to this interest in terms of the Rental Housing Act." },
      { type: "paragraph", text: "If you have any questions about this statement, please contact us at {{branding.orgEmail}}." },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Move-in inspection report — RHA s5(3)(c); absolute disagree deadline ────────────────────
  {
    key: "inspection.move_in_report",
    channel: "email",
    commsClass: "statutory",
    name: "Move-In Inspection Report",
    description: "Joint move-in inspection record (RHA s5(3)(c)).",
    category: "inspections",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{conductedDate}}", "{{overallCondition}}", "{{disagreeDeadline}}", "{{referenceNumber}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §4.4 (F-1 Tier-3 s5(3)(c) · FINDING R2/R4 · §16 Tribunal removed — routine onboarding)",
    issuedUnder: "This report documents the joint inspection conducted pursuant to section 5(3)(c) of the Rental Housing Act 50 of 1999. Reference: {{referenceNumber}}. Landlord agent: {{branding.orgName}}. It is kept as the agreed baseline record of the property's condition at the start of your tenancy.",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "MOVE-IN INSPECTION REPORT" },
      { type: "paragraph", text: "Ref: {{referenceNumber}} · Property: {{propertyLabel}}" },
      { type: "paragraph", text: "Following the joint move-in inspection conducted pursuant to section 5(3)(c) of the Rental Housing Act 50 of 1999, please find below the official record of the property's condition at the commencement of your tenancy." },
      { type: "dataBox", rows: [
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Inspection date", value: "{{conductedDate}}" },
        { label: "Overall condition", value: "{{overallCondition}}" },
        { label: "Reference", value: "{{referenceNumber}}" },
      ] },
      { type: "paragraph", text: "This report is the baseline record against which the property's condition will be assessed at the end of your tenancy. It will be used in the event of any deposit deduction claims." },
      { type: "callout", tone: "info", text: "If you disagree with anything in this record, please let us know by **{{disagreeDeadline}}** — reply to this email with your comments and any supporting photographs. After this date the record stands as the agreed baseline for your tenancy." },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Move-out dispute window — RHA s5(3)(c); 7-day window contractual; absolute deadline ─────
  {
    key: "inspection.dispute_window",
    channel: "email",
    commsClass: "statutory",
    name: "Move-Out Inspection — Dispute Window",
    description: "Move-out dispute window notice (RHA s5(3)(c) read with the lease clause).",
    category: "inspections",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{conductedDate}}", "{{disputeWindowClosesAt}}", "{{referenceNumber}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §4.6 (F-1 #9 · FINDING R2/R4)",
    issuedUnder: "This notice follows the joint move-out inspection conducted pursuant to section 5(3)(c) of the Rental Housing Act 50 of 1999. Reference: {{referenceNumber}}. Landlord agent: {{branding.orgName}}. If you believe this notice is incorrect, you may refer the matter to the Rental Housing Tribunal in your province.",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "MOVE-OUT INSPECTION — DISPUTE WINDOW NOTICE" },
      { type: "paragraph", text: "Ref: {{referenceNumber}} · Property: {{propertyLabel}}" },
      { type: "paragraph", text: "Following the joint move-out inspection of the above property conducted pursuant to Section 5(3)(c) of the Rental Housing Act 50 of 1999 read with the applicable clause of your Lease Agreement, you are advised that you have until **{{disputeWindowClosesAt}}** to dispute the inspection findings before the formal deposit return schedule is issued." },
      { type: "dataBox", rows: [
        { label: "Property", value: "{{propertyLabel}}" },
        { label: "Inspection conducted", value: "{{conductedDate}}" },
        { label: "Reference", value: "{{referenceNumber}}" },
      ] },
      { type: "callout", tone: "warn", text: "Your right to dispute: if you dispute any finding, you must notify us in writing before **{{disputeWindowClosesAt}}**. Disputes received after this date may not be considered. To dispute, reply to this email with your specific objections and supporting documentation (photographs, condition reports, prior correspondence)." },
      { type: "paragraph", text: "If no dispute is received before {{disputeWindowClosesAt}}, the inspection findings will be accepted and any applicable deductions will be processed in accordance with the deposit return schedule, which will be issued separately." },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Lease expiry reminder — CPA s14(2)(d)/contractual conditional ───────────────────────────
  {
    key: "lease.expiry_reminder",
    channel: "email",
    commsClass: "statutory",
    name: "Lease Expiry Reminder",
    description: "Lease expiry reminder (CPA s14(2)(d) / lease terms).",
    category: "leases",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{leaseEndDate}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §2.7 (F-1 #10 · FINDING R2/R4)",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "Your lease is expiring soon" },
      { type: "paragraph", text: "Your fixed-term lease for **{{propertyLabel}}** expires on **{{leaseEndDate}}**." },
      { type: "dataBox", rows: [
        { label: "Renew your lease", value: "contact us to negotiate a new fixed-term or month-to-month arrangement." },
        { label: "Continue month-to-month", value: "if no action is taken, your lease automatically converts to month-to-month under the same terms." },
        { label: "Vacate on expiry", value: "give written notice to confirm your intention to vacate by {{leaseEndDate}}." },
      ] },
      { type: "paragraph", text: "Please contact {{branding.orgEmail}} to confirm your intentions by no later than {{leaseEndDate}} so we can plan accordingly." },
      { type: "cpaConditional",
        ifCpa: "This notice is issued in accordance with Section 14(2)(d) of the Consumer Protection Act 68 of 2008. Your lease will automatically convert to a month-to-month tenancy on expiry unless either party gives notice of non-renewal.",
        otherwise: "This notice is issued in accordance with the terms of your Lease Agreement. Your lease will automatically convert to a month-to-month tenancy on expiry unless either party gives notice of non-renewal." },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Lease terminated — confirmation + next steps ────────────────────────────────────────────
  {
    key: "lease.terminated",
    channel: "email",
    commsClass: "statutory",
    name: "Tenancy Ended",
    description: "Lease termination confirmation + next steps.",
    category: "leases",
    mergeFields: [...RECIPIENT, "{{propertyLabel}}", "{{leaseEndDate}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §2.9 (F-1 Tier-3 · FINDING R4)",
    issuedUnder: "Your deposit return schedule will be processed within the statutory period following the final move-out inspection. This notice is issued in accordance with the Rental Housing Act 50 of 1999.",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "heading", text: "Your tenancy has ended" },
      { type: "paragraph", text: "This letter confirms that your tenancy at **{{propertyLabel}}** has concluded as of **{{leaseEndDate}}** following the expiry of your notice period." },
      { type: "list", items: [
        "Return all keys and access devices to the agency",
        "Ensure the property is left in the condition required by your lease",
        "A final move-out inspection will be conducted to assess the property",
        "Your deposit reconciliation will follow in terms of the Rental Housing Act",
      ] },
      { type: "paragraph", text: "If you have already vacated, please contact {{branding.orgEmail}} to confirm key handover and arrange the final inspection." },
      { type: "legalFooterSlot" },
    ],
  },

  // ── Lease renewal notice (CPA s14) ──────────────────────────────────────────────────────────
  {
    key: "lease.renewal_notice",
    channel: "email",
    commsClass: "statutory",
    name: "Lease Renewal Notice (CPA s14)",
    description: "Impending-expiry renewal notice (CPA s14).",
    category: "leases",
    mergeFields: [...RECIPIENT, "{{propertyName}}", "{{unitLabel}}", "{{endDate}}", ...ORG],
    legalReviewRef: "ADDENDUM_70C §2.10 (F-1 Tier-3 CPA s14 · FINDING R2/R4)",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "This notice is sent in accordance with Section 14 of the Consumer Protection Act 68 of 2008." },
      { type: "heading", text: "Your lease details" },
      { type: "dataBox", rows: [
        { label: "Property", value: "{{unitLabel}} — {{propertyName}}" },
        { label: "Lease end date", value: "{{endDate}}" },
      ] },
      { type: "heading", text: "What this means for you" },
      { type: "paragraph", text: "Your fixed-term lease expires on **{{endDate}}**. Under the Consumer Protection Act, your lease will automatically convert to a month-to-month tenancy on that date unless either party gives notice of non-renewal." },
      { type: "callout", tone: "warn", text: "If you do not wish to continue renting after {{endDate}}, you must give written notice by no later than {{endDate}}. Please contact {{branding.orgName}}." },
      { type: "heading", text: "Your options" },
      { type: "paragraph", text: "**Continue month-to-month:** No action needed. Your tenancy will continue under the same terms until either party gives one calendar month's written notice." },
      { type: "paragraph", text: "**Renew for a fixed term:** Contact {{branding.orgName}} to discuss a lease renewal." },
      { type: "paragraph", text: "**Vacate on expiry:** Give written notice to {{branding.orgName}} by no later than {{endDate}}." },
      { type: "paragraph", text: "Contact {{branding.orgName}} · {{branding.orgPhone}} · {{branding.orgEmail}}" },
      { type: "legalFooterSlot" },
    ],
  },
]
