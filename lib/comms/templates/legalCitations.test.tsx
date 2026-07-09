/**
 * lib/comms/templates/legalCitations.test.tsx — O-14 citation fix-forward regression guard (ADDENDUM_70B F-1)
 *
 * Asserts the counsel-authorized citation strings AND that the corrected statutory templates no longer
 * carry the superseded ones (RHA s5(4) cancellation, CPA s65, RHA s5(9), NCA) + all render the canonical
 * ECTA stack via the shared LegalFooter.
 */

import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import {
  ECTA_FOOTER_TEXT,
  finalNoticeCancellationBasis,
  leaseExpiryBasis,
  lodCancellationBasis,
  DEPOSIT_RETURN_SCHEDULE_BASIS,
  DEPOSIT_RETURNED_BASIS,
  DEPOSIT_INTEREST_BASIS,
  INSPECTION_BASIS,
} from "./legalCitations"
import { LegalFooter } from "./LegalFooter"
import { FinalNoticeEmail } from "./tenant/arrears/final-notice"
import { LetterOfDemandEmail } from "./tenant/arrears/letter-of-demand"
import { DepositInterestStatementEmail } from "./tenant/deposits/deposit-interest-statement"
import { DepositReturnScheduleEmail } from "./tenant/deposits/deposit-return-schedule"
import { DepositReturnedEmail } from "./tenant/deposits/deposit-returned"
import { InspectionDisputeWindowEmail } from "./tenant/inspections/inspection-dispute-window"
import { InspectionMoveInReportEmail } from "./tenant/inspections/inspection-move-in-report"
import { LeaseExpiryReminderEmail } from "./tenant/leases/lease-expiry-reminder"
import { LeaseTerminatedEmail } from "./tenant/leases/lease-terminated"
import type { OrgBranding } from "./layout"

const branding: OrgBranding = { orgName: "Acme Lettings", orgPhone: "021 000 0000", orgEmail: "h@acme.test" }

describe("legalCitations — counsel-authorized strings (F-1)", () => {
  it("final-notice cure basis is CPA-conditional, never RHA s5(4)", () => {
    expect(finalNoticeCancellationBasis(true)).toContain("Section 14(2)(b)(ii) of the Consumer Protection Act 68 of 2008")
    expect(finalNoticeCancellationBasis(false)).toContain("Common Law")
    expect(finalNoticeCancellationBasis(undefined)).not.toContain("Consumer Protection") // safe default = contractual
    expect(finalNoticeCancellationBasis(true)).not.toMatch(/5\(4\)|Rental Housing Act/)
  })

  it("LOD basis is purely contractual — never CPA s14, never RHA s5(4)", () => {
    const b = lodCancellationBasis()
    expect(b).toContain("Common Law")
    expect(b).not.toMatch(/Consumer Protection|14\(2\)|5\(4\)|Rental Housing Act/)
  })

  it("lease expiry basis is CPA s14(2)(d) or contractual, never a general RHA reference", () => {
    expect(leaseExpiryBasis(true)).toContain("Section 14(2)(d) of the Consumer Protection Act 68 of 2008")
    expect(leaseExpiryBasis(false)).toContain("Lease Agreement")
    expect(leaseExpiryBasis(false)).not.toContain("Rental Housing Act")
  })

  it("deposit bases use the precise RHA subdivisions and never the NCA or s5(9)", () => {
    expect(DEPOSIT_RETURN_SCHEDULE_BASIS).toBe("Section 5(3)(g) read with Section 5(7) of the Rental Housing Act 50 of 1999")
    expect(DEPOSIT_RETURNED_BASIS).toContain("Section 5(3)(g)(i)")
    expect(DEPOSIT_INTEREST_BASIS).toContain("Section 5(3)(d)")
    expect(DEPOSIT_INTEREST_BASIS).not.toContain("National Credit Act")
    expect(INSPECTION_BASIS).toContain("Section 5(3)(c)")
    expect([DEPOSIT_RETURN_SCHEDULE_BASIS, DEPOSIT_RETURNED_BASIS].join(" ")).not.toContain("5(9)")
  })

  it("ECTA stack is the canonical s11(1)+s12+s13(2)–(3)+s23 string", () => {
    expect(ECTA_FOOTER_TEXT).toContain("Sections 11(1), 12, and 13(2)–(3)")
    expect(ECTA_FOOTER_TEXT).toContain("Electronic Communications and Transactions Act 25 of 2002")
    expect(ECTA_FOOTER_TEXT).toContain("Dispatch and receipt governed by Section 23")
  })
})

describe("LegalFooter render", () => {
  it("renders the ECTA stack + an optional issuing-basis line", async () => {
    const html = await render(LegalFooter({ issuedUnder: "Issued under the test basis." }))
    expect(html).toContain("Electronic Communications and Transactions Act 25 of 2002")
    expect(html).toContain("Issued under the test basis.")
  })
})

describe("corrected statutory templates — wrong citations gone, right present, ECTA rendered", () => {
  const finalNoticeProps = {
    branding, tenantName: "John Doe", propertyLabel: "Unit 1", leaseStartDate: "1 Jan 2024",
    amountOwedDisplay: "R 10 000", monthsInArrears: 2, oldestOutstandingDate: "1 Mar 2026",
    cancellationNoticeDays: 20, referenceNumber: "REF-1",
  }

  it("final-notice: RHA s5(4) gone; CPA s14(2)(b)(ii) when CPA applies; contractual when not; ECTA present", async () => {
    const cpa = await render(FinalNoticeEmail({ ...finalNoticeProps, cpaApplies: true }))
    expect(cpa).not.toContain("section 5(4)")
    expect(cpa).toContain("Section 14(2)(b)(ii) of the Consumer Protection Act 68 of 2008")
    expect(cpa).toContain("Electronic Communications and Transactions Act 25 of 2002")

    const noCpa = await render(FinalNoticeEmail({ ...finalNoticeProps, cpaApplies: false }))
    expect(noCpa).not.toContain("section 5(4)")
    expect(noCpa).toContain("Common Law")
  })

  it("letter-of-demand: RHA s5(4) + CPA s65 gone; contractual basis; ECTA present", async () => {
    const html = await render(LetterOfDemandEmail({
      branding, tenantName: "John Doe", propertyLabel: "Unit 1", leaseStartDate: "1 Jan 2024",
      amountOwedDisplay: "R 10 000", monthsInArrears: 2, oldestOutstandingDate: "1 Mar 2026",
      paymentDeadlineDays: 7, referenceNumber: "REF-2",
    }))
    expect(html).not.toContain("section 5(4)")
    expect(html).not.toMatch(/s65|section 65/)
    expect(html).not.toContain("Consumer Protection Act") // LOD must not cite CPA s14
    expect(html).toContain("Common Law")
    expect(html).toContain("Electronic Communications and Transactions Act 25 of 2002")
  })

  it("deposit-interest: NCA gone; RHA s5(3)(d) present; ECTA present", async () => {
    const html = await render(DepositInterestStatementEmail({
      branding, tenantName: "John Doe", propertyLabel: "Unit 1", periodFrom: "1 Jun 2025",
      periodTo: "31 May 2026", depositHeldDisplay: "R 10 000", interestThisPeriodDisplay: "R 700",
      cumulativeInterestDisplay: "R 700", effectiveRateDisplay: "7.50%", senderName: "Acme",
    }))
    expect(html).not.toContain("National Credit Act")
    expect(html).toContain("Section 5(3)(d)")
    expect(html).toContain("Electronic Communications and Transactions Act 25 of 2002")
  })

  it("lease-expiry: general RHA gone; ECTA present; contractual basis by default", async () => {
    const html = await render(LeaseExpiryReminderEmail({
      branding, tenantName: "John Doe", propertyLabel: "Unit 1", leaseEndDate: "1 Jun 2026",
      daysRemaining: 30, senderName: "Acme",
    }))
    expect(html).toContain("Electronic Communications and Transactions Act 25 of 2002")
    expect(html).toContain("the terms of your Lease Agreement")
  })
})

// 70F §8 invariant #1 — every statutory email COMPONENT renders the shared LegalFooter (ECTA stack).
// (The lease.renewal_notice is a send-action in lib/leases/emails.tsx, not a pure component — it also
//  carries LegalFooter; asserted by code review, not rendered here to avoid mocking the send path.)
describe("70F §8 #1 — every statutory email component carries the canonical ECTA footer", () => {
  const ECTA_MARK = "Electronic Communications and Transactions Act 25 of 2002"
  const cases = [
    { name: "letter-of-demand", el: LetterOfDemandEmail({ branding, tenantName: "J", propertyLabel: "U", leaseStartDate: "1 Jan 2024", amountOwedDisplay: "R 1", monthsInArrears: 1, oldestOutstandingDate: "1 Mar 2026", paymentDeadlineDays: 7, referenceNumber: "R" }) },
    { name: "final-notice", el: FinalNoticeEmail({ branding, tenantName: "J", propertyLabel: "U", leaseStartDate: "1 Jan 2024", amountOwedDisplay: "R 1", monthsInArrears: 1, oldestOutstandingDate: "1 Mar 2026", cancellationNoticeDays: 20, referenceNumber: "R" }) },
    { name: "deposit-return-schedule", el: DepositReturnScheduleEmail({ branding, tenantName: "J", propertyLabel: "U", leaseStartDate: "1 Jan 2024", leaseEndDate: "1 Jan 2026", depositHeldDisplay: "R 1", interestAccruedDisplay: "R 0", totalAvailableDisplay: "R 1", totalDeductionsDisplay: "R 0", refundToTenantDisplay: "R 1", deductionItems: [], chargeItems: [], deadlineDate: "1 Feb 2026", returnDays: 7, referenceNumber: "R" }) },
    { name: "deposit-returned", el: DepositReturnedEmail({ branding, tenantName: "J", propertyLabel: "U", refundAmountDisplay: "R 1", referenceNumber: "R", disbursedDate: "1 Feb 2026", senderName: "Acme" }) },
    { name: "deposit-interest-statement", el: DepositInterestStatementEmail({ branding, tenantName: "J", propertyLabel: "U", periodFrom: "1 Jun 2025", periodTo: "31 May 2026", depositHeldDisplay: "R 1", interestThisPeriodDisplay: "R 0", cumulativeInterestDisplay: "R 0", effectiveRateDisplay: "7.5%", senderName: "Acme" }) },
    { name: "inspection-move-in-report", el: InspectionMoveInReportEmail({ branding, tenantName: "J", propertyLabel: "U", conductedDate: "1 Jan 2024", referenceNumber: "R", objectionDeadline: "8 Jan 2024" }) },
    { name: "inspection-dispute-window", el: InspectionDisputeWindowEmail({ branding, tenantName: "J", propertyLabel: "U", conductedDate: "1 Jan 2026", disputeWindowClosesAt: "8 Jan 2026", referenceNumber: "R" }) },
    { name: "lease-expiry-reminder", el: LeaseExpiryReminderEmail({ branding, tenantName: "J", propertyLabel: "U", leaseEndDate: "1 Jun 2026", daysRemaining: 30, senderName: "Acme" }) },
    { name: "lease-terminated", el: LeaseTerminatedEmail({ branding, tenantName: "J", propertyLabel: "U", leaseEndDate: "1 Jun 2026", senderName: "Acme" }) },
  ]
  it.each(cases)("$name carries the ECTA footer", async ({ el }) => {
    expect(await render(el)).toContain(ECTA_MARK)
  })
})
