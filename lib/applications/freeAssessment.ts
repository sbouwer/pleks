/**
 * lib/applications/freeAssessment.ts — Step-1 ZERO-AI assessment (the free stage of the screening funnel).
 *
 * No AI, no extraction — runs at submit on declared figures + upload completeness only (R0 at any volume). Produces
 * the two honest signals the agent shortlists on (ADDENDUM_14M three-step funnel):
 *   • Combined DECLARED affordability — primary + co-applicants summed vs rent; UNVERIFIED ("on stated figures").
 *     Guarantors are EXCLUDED (a backstop, not co-earners sharing the rent — see GUARANTOR_MIN_INCOME_MULTIPLE).
 *   • Readiness — is this application complete + self-consistent enough to be worth a (paid) Step-2 deep scan:
 *     every applicant finished their part, and every SA-ID checksum validates.
 * NOT a confidence score — nothing is verified until the deep scan. Surfaces + sorts; never auto-decides.
 * Fast-follow: zero-AI file-metadata flags (Photoshop/embedded-ID) as a third readiness input (needs doc bytes).
 */
import { INCOME_AFFORDABILITY_THRESHOLD } from "@/lib/constants"
import { validateSAId } from "@/lib/parties/partyValidation"
import { calculateCombinedAffordability } from "@/lib/screening/combinedAffordability"

const MARGINAL_CEILING = 0.35

export type DeclaredAffordabilityTier = "within" | "marginal" | "below" | "no-income"
export type ReadinessBand = "ready" | "partial" | "incomplete"

export interface FreeApplicantInput {
  role: "primary" | "co_applicant" | "guarantor"
  declaredIncomeCents: number
  idType: string | null
  idNumber: string | null
  complete: boolean   // finished their part (identity + income + docs + consent)
}

export interface FreeAssessmentResult {
  combinedIncomeCents: number          // primary + co-applicants (guarantors excluded)
  declaredRatioPct: number | null      // rent ÷ combined income, on STATED figures (unverified)
  affordabilityTier: DeclaredAffordabilityTier
  readiness: { band: ReadinessBand; allComplete: boolean; incompleteCount: number; invalidIdCount: number; total: number }
}

/** True only when an SA-ID number fails the Luhn checksum; a passport/other id type is never "invalid" here. */
function idChecksumFails(idType: string | null, idNumber: string | null): boolean {
  if (idType !== "sa_id") return false
  return validateSAId(idNumber ?? undefined)?.valid !== true
}

export function freeAssessment(rentCents: number, applicants: FreeApplicantInput[]): FreeAssessmentResult {
  // Affordability: co-applicants share the rent → summed; guarantors are a backstop → excluded.
  const primary = applicants.find((a) => a.role === "primary")?.declaredIncomeCents ?? 0
  const coIncomes = applicants.filter((a) => a.role === "co_applicant").map((a) => a.declaredIncomeCents)
  const { combinedIncome, ratio } = calculateCombinedAffordability(primary, coIncomes, rentCents)
  const declaredRatioPct = ratio != null ? Math.round(ratio * 100) : null

  let affordabilityTier: DeclaredAffordabilityTier
  if (combinedIncome <= 0) affordabilityTier = "no-income"
  else if (ratio != null && ratio <= INCOME_AFFORDABILITY_THRESHOLD) affordabilityTier = "within"
  else if (ratio != null && ratio <= MARGINAL_CEILING) affordabilityTier = "marginal"
  else affordabilityTier = "below"

  // Readiness spans ALL applicants incl. guarantors — an unverifiable guarantor is a weak application too.
  const total = applicants.length
  const incompleteCount = applicants.filter((a) => !a.complete).length
  const invalidIdCount = applicants.filter((a) => idChecksumFails(a.idType, a.idNumber)).length
  const allComplete = incompleteCount === 0
  let band: ReadinessBand
  if (allComplete && invalidIdCount === 0) band = "ready"
  else if (total > 0 && incompleteCount >= total) band = "incomplete"
  else band = "partial"

  return { combinedIncomeCents: combinedIncome, declaredRatioPct, affordabilityTier, readiness: { band, allComplete, incompleteCount, invalidIdCount, total } }
}
