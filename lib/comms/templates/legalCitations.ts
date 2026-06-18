/**
 * lib/comms/templates/legalCitations.ts — statutory citation SSOT (ADDENDUM_70B Appendix F-1)
 *
 * Data:   the counsel-authorized citation strings (F-1 "COMPLETE authorized citation matrix", 2026-06-13)
 * Notes:  Citation-as-DATA (70F invariant #4 / 70E D7): every statutory template imports its basis from
 *         here, so a correction is a one-line change in one file, not a hunt through N components, and the
 *         shared LegalFooter renders the canonical ECTA stack uniformly. CPA-conditional citations
 *         (final-notice, expiry-reminder) resolve on the lease's cpa_applies_at_signing snapshot.
 *         SAFE DEFAULT: when CPA applicability is unknown, the CONTRACTUAL + common-law basis renders —
 *         it is never wrong (the lease breach clause + common law always ground the step); the CPA
 *         citation is the additive stronger basis surfaced only when the caller confirms CPA applies.
 */

/** F-1 #11 — the canonical ECTA recognition stack. The ONE string every statutory template carries. */
export const ECTA_FOOTER_TEXT =
  "Recognised as a legally binding electronic data message and signature pursuant to " +
  "Sections 11(1), 12, and 13(2)–(3) of the Electronic Communications and Transactions Act 25 of 2002. " +
  "Dispatch and receipt governed by Section 23."

// Where a lease clause number is owner/lease-specific it is rendered via merge field; absent that,
// this generic phrase grounds the step in the lease without asserting a clause number we don't have.
const DEFAULT_CLAUSE = "the applicable clause of the Lease Agreement"

/**
 * Final notice — pre-cancellation cure basis (F-1 #1). CPA applies → CPA s14(2)(b)(ii) read with the
 * lease clause; else → contractual clause + common law (lex commissoria). NEVER RHA s5(4).
 */
export function finalNoticeCancellationBasis(cpaApplies?: boolean, clauseRef: string = DEFAULT_CLAUSE): string {
  return cpaApplies
    ? `Section 14(2)(b)(ii) of the Consumer Protection Act 68 of 2008 read with ${clauseRef}`
    : `${clauseRef} read with the Common Law`
}

/**
 * Lease expiry reminder — notice basis (F-1 #10). CPA applies → CPA s14(2)(d); else → the lease terms.
 * NEVER a general RHA reference (the RHA does not regulate expiry notices).
 */
export function leaseExpiryBasis(cpaApplies?: boolean): string {
  return cpaApplies
    ? "Section 14(2)(d) of the Consumer Protection Act 68 of 2008"
    : "the terms of your Lease Agreement"
}

/**
 * Letter of Demand — cancellation basis (F-1 #3): PURELY CONTRACTUAL. Must NOT cite CPA s14 (that would
 * wrongly trigger the 20-business-day cure — which belongs on the final notice, not the first demand)
 * and must NOT cite RHA s5(4). NOT CPA-conditional — always contractual + common law.
 */
export function lodCancellationBasis(clauseRef: string = DEFAULT_CLAUSE): string {
  return `${clauseRef} read with the Common Law`
}

// ── Deposit + inspection statutory bases (RHA 50 of 1999) — static, F-1 #5–#9 ──
// ⚠ COMMENCEMENT WATCH: these cite the principal Act §5 because the Rental Housing Amendment Act 35 of
// 2014 is NOT in force (no presidential proclamation as of 2026-06-18, web-verified). If proclaimed, ALL
// deposit citations below migrate §5 → §4A/4B together with the deposit clause (migration 011) and
// lib/rules/compliance/deposit-deadline-breach.ts (with the s21 6-month transition). Until then, §5 stands.
/** F-1 #5 — deposit return schedule (s5(9) struck; it does not exist). */
export const DEPOSIT_RETURN_SCHEDULE_BASIS =
  "Section 5(3)(g) read with Section 5(7) of the Rental Housing Act 50 of 1999"
/** F-1 #8 — deposit returned, no-damage path (flat s5(3)(g) → the precise subdivision). */
export const DEPOSIT_RETURNED_BASIS =
  "Section 5(3)(g)(i) of the Rental Housing Act 50 of 1999"
/** F-1 #7 — deposit interest (NCA struck — a residential lease deposit is not credit). */
export const DEPOSIT_INTEREST_BASIS =
  "Section 5(3)(d) of the Rental Housing Act 50 of 1999"
/** F-1 #9 — inspection dispute window: s5(3)(c) grounds the inspection; the 7-day window is contractual. */
export const INSPECTION_BASIS =
  "Section 5(3)(c) of the Rental Housing Act 50 of 1999"

/** POPIA processing line for external-PII recipients (70F §3). orgName is a token in seed review. */
export function popiaProcessingLine(orgName: string): string {
  return (
    `Your information is processed by ${orgName} under the Protection of Personal Information Act ` +
    `(POPIA). You may request access to, correction of, or deletion of this information at any time.`
  )
}
