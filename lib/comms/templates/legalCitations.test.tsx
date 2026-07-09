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
  demandVacateBreachBasis,
  demandVacateExpiryBasis,
  demandVacateM2mBasis,
  RENTAL_HOUSING_TRIBUNAL_LINE,
} from "./legalCitations"
import { LegalFooter } from "./LegalFooter"
import { DemandToVacateBreachEmail } from "./tenant/leases/demand-to-vacate-breach"
import { DemandToVacateExpiryEmail } from "./tenant/leases/demand-to-vacate-expiry"
import { DemandToVacateM2mEmail } from "./tenant/leases/demand-to-vacate-m2m"
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

// LEG-NOTICES-01 / R7.3 — Demand-to-Vacate citation bases. The load-bearing property (R-8 lesson): the
// 3-state cpa_applies_at_signing must cite the CPA ONLY on an explicit "yes" — never on a truthy
// "no"/"indeterminate"/null string. These helpers own that rule so no caller can re-introduce the mis-cast.
describe("legalCitations — Demand-to-Vacate bases (3-state CPA safety)", () => {
  it("breach basis: CPA s14(2)(b)(i)(bb) ONLY on 'yes'; safe contractual+common-law otherwise", () => {
    expect(demandVacateBreachBasis("yes")).toContain("section 14(2)(b)(i)(bb) of the Consumer Protection Act 68 of 2008")
    for (const s of ["no", "indeterminate", null, undefined] as const) {
      expect(demandVacateBreachBasis(s)).not.toContain("Consumer Protection")
      expect(demandVacateBreachBasis(s)).toContain("common law")
    }
  })

  it("expiry basis: CPA s14(2) ONLY on 'yes'; both branches carry the RHA; never CPA on non-yes", () => {
    expect(demandVacateExpiryBasis("yes")).toContain("section 14(2) of the Consumer Protection Act 68 of 2008")
    for (const s of ["no", "indeterminate", null, undefined] as const) {
      expect(demandVacateExpiryBasis(s)).not.toContain("Consumer Protection")
      expect(demandVacateExpiryBasis(s)).toContain("Rental Housing Act 50 of 1999")
    }
    expect(demandVacateExpiryBasis("yes")).toContain("Rental Housing Act 50 of 1999")
  })

  it("month-to-month basis: RHA s5(5), never the CPA (no fixed term to invoke s14)", () => {
    expect(demandVacateM2mBasis()).toContain("section 5(5) of the Rental Housing Act 50 of 1999")
    expect(demandVacateM2mBasis()).not.toContain("Consumer Protection")
  })

  it("Tribunal signpost names the responsible department (rename-proof), not a namable body", () => {
    expect(RENTAL_HOUSING_TRIBUNAL_LINE).toContain("provincial department responsible for human settlements")
  })
})

describe("Demand-to-Vacate templates — verbatim citation branch + ECTA/Tribunal footer", () => {
  const base = {
    branding, tenantName: "John Doe", serviceAddress: "1 Main Rd, Cape Town, 8001",
    propertyLabel: "Unit 1, The Heights", referenceNumber: "DTV-1", landlordOrAgentName: "Acme Lettings",
    vacateByDate: "20 July 2026", todaysDate: "6 July 2026",
  }

  it("breach: CPA branch on 'yes', contractual on 'no'; PIE + ECTA + Tribunal present", async () => {
    const cpa = await render(DemandToVacateBreachEmail({ ...base, finalNoticeDate: "1 June 2026", cancellationEffectiveDate: "1 July 2026", cpaApplies: "yes" }))
    expect(cpa).toContain("section 14(2)(b)(i)(bb) of the Consumer Protection Act 68 of 2008")
    expect(cpa).toContain("Prevention of Illegal Eviction")
    expect(cpa).toContain("Electronic Communications and Transactions Act 25 of 2002")
    expect(cpa).toContain("provincial department responsible for human settlements")

    const noCpa = await render(DemandToVacateBreachEmail({ ...base, finalNoticeDate: "1 June 2026", cancellationEffectiveDate: "1 July 2026", cpaApplies: "no" }))
    expect(noCpa).not.toContain("Consumer Protection")
    expect(noCpa).toContain("common law")
  })

  it("expiry: CPA s14(2) on 'yes'; both branches carry RHA; ECTA + Tribunal present", async () => {
    const cpa = await render(DemandToVacateExpiryEmail({ ...base, leaseEndDate: "30 June 2026", cpaApplies: "yes" }))
    expect(cpa).toContain("section 14(2) of the Consumer Protection Act 68 of 2008")
    expect(cpa).toContain("Rental Housing Act 50 of 1999")
    expect(cpa).toContain("provincial department responsible for human settlements")

    const indeterminate = await render(DemandToVacateExpiryEmail({ ...base, leaseEndDate: "30 June 2026", cpaApplies: "indeterminate" }))
    expect(indeterminate).not.toContain("Consumer Protection")
    expect(indeterminate).toContain("Rental Housing Act 50 of 1999")
  })

  it("month-to-month: RHA s5(5), no CPA; ECTA + Tribunal present", async () => {
    const html = await render(DemandToVacateM2mEmail({ ...base, terminationNoticeDate: "1 June 2026", leaseEndDate: "30 June 2026" }))
    expect(html).toContain("section 5(5) of the Rental Housing Act 50 of 1999")
    expect(html).not.toContain("Consumer Protection")
    expect(html).toContain("Electronic Communications and Transactions Act 25 of 2002")
    expect(html).toContain("provincial department responsible for human settlements")
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
    { name: "demand-to-vacate-breach", el: DemandToVacateBreachEmail({ branding, tenantName: "J", serviceAddress: "1 Main Rd", propertyLabel: "U", referenceNumber: "R", landlordOrAgentName: "Acme", finalNoticeDate: "1 Jun 2026", cancellationEffectiveDate: "1 Jul 2026", vacateByDate: "20 Jul 2026", todaysDate: "6 Jul 2026", cpaApplies: "yes" }) },
    { name: "demand-to-vacate-expiry", el: DemandToVacateExpiryEmail({ branding, tenantName: "J", serviceAddress: "1 Main Rd", propertyLabel: "U", referenceNumber: "R", landlordOrAgentName: "Acme", leaseEndDate: "30 Jun 2026", vacateByDate: "20 Jul 2026", todaysDate: "6 Jul 2026", cpaApplies: "no" }) },
    { name: "demand-to-vacate-m2m", el: DemandToVacateM2mEmail({ branding, tenantName: "J", serviceAddress: "1 Main Rd", propertyLabel: "U", referenceNumber: "R", landlordOrAgentName: "Acme", terminationNoticeDate: "1 Jun 2026", leaseEndDate: "30 Jun 2026", vacateByDate: "20 Jul 2026", todaysDate: "6 Jul 2026" }) },
  ]
  it.each(cases)("$name carries the ECTA footer", async ({ el }) => {
    expect(await render(el)).toContain(ECTA_MARK)
  })
})
