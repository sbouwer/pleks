/**
 * lib/screening/visaLeaseCheck.ts — check whether a proposed lease end aligns with permit expiry, returning a warning + recommendation
 *
 * Notes:  a lease ending past permit expiry is flagged incompatible with a suggested shortened end (1 month before expiry) or break clause; within 6 months prompts a renewal-confirmation nudge.
 *
 * ⚠ `assessed` EXISTS BECAUSE THIS CHECK WAS VACUOUS IN THE FIELD. Its only caller — the agent's
 * application detail page — passes `null` for `proposedLeaseEnd`, so the null guard below was the
 * only branch that ever ran and every foreign-national applicant got a constant all-clear. Neither
 * warned outcome could render: not the incompatibility warning, and not the "permit expires within
 * 6 months, confirm renewal" nudge. The agent saw a screen that had visibly run a visa/lease check
 * and raised nothing, then signed a 12-month lease with a permit holder whose permit lapses in
 * month four — the tenancy this check exists to prevent.
 *
 * A missing input is now reported as MISSING rather than as compatible. "Compatible" is an answer;
 * "no lease end to compare against" is the absence of one, and a surface that renders them the same
 * way is claiming a safety it never established (the vacuous-assertion rule in
 * `.claude/rules/lint-rules.md`, one axis over: a green tick is a claim, and a vacuous one is false).
 *
 * The proposed lease end is NOT derived here or at the call site. `assembleReportData` hardcodes
 * `termMonths: 12` and no per-application lease end is stored, so any derivation would be a guess —
 * and warning an agent about a term they never proposed is a worse failure than saying nothing.
 * Wiring a real term in is the follow-up; surfacing that it is missing is this fix.
 */
import { differenceInDays, subDays, format } from "date-fns"

export interface VisaLeaseAlignment {
  /** False when an input was missing, so `compatible` carries no information. */
  assessed: boolean
  compatible: boolean
  warning: string | null
  recommendation: string | null
}

export function checkVisaLeaseAlignment(
  permitExpiry: Date | null,
  proposedLeaseEnd: Date | null
): VisaLeaseAlignment {
  if (!permitExpiry) return { assessed: false, compatible: true, warning: null, recommendation: null }
  if (!proposedLeaseEnd) return { assessed: false, compatible: true, warning: null, recommendation: null }

  const daysToPermitExpiry = differenceInDays(permitExpiry, new Date())
  const leaseWithinPermit = proposedLeaseEnd <= permitExpiry

  if (leaseWithinPermit) {
    return {
      assessed: true,
      compatible: true,
      warning: null,
      recommendation: daysToPermitExpiry < 180
        ? `Permit expires ${format(permitExpiry, "dd MMM yyyy")} — within 6 months. Confirm permit renewal is in progress before signing.`
        : null,
    }
  }

  return {
    assessed: true,
    compatible: false,
    warning: `Proposed lease end (${format(proposedLeaseEnd, "dd MMM yyyy")}) extends past permit expiry (${format(permitExpiry, "dd MMM yyyy")}).`,
    recommendation: `Shorten lease end to ${format(subDays(permitExpiry, 30), "dd MMM yyyy")} (1 month before permit expiry) OR include a lease break clause if permit is not renewed.`,
  }
}
