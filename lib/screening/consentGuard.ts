/**
 * lib/screening/consentGuard.ts — the "no screening without recorded consent" invariant (BUILD_69 P3 / POPIA s11)
 *
 * Auth:   service-role db (the screening crons run service-side).
 * Data:   applications / application_co_applicants — reads stage2_consent_given_at for the subject.
 * Notes:  Codified-everywhere guard (the D-TRUST-01 pattern — see lib/trust/invariants.ts). Searchworx +
 *         FitScore must NOT run on a subject that has not given explicit, recorded screening consent.
 *         Today the cron path is already gated structurally — v_application_screening_lines only computes
 *         `ready_to_run` once stage2_consent_given_at is set, and the line-runner only consumes ready_to_run.
 *         This invariant is the BELT over that: any screening/extraction entrypoint (incl. a future
 *         non-cron path, and BUILD_14L document extraction when it's wired to production — currently
 *         harness-only) must call assertScreeningConsent so consent can't be bypassed by construction.
 *         Throws (an invariant breach is loud, never a silent skip) — mirrors SovereignTrustViolation.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/** Thrown when a screening/extraction path is reached for a subject with no recorded stage-2 consent. */
export class ScreeningConsentViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScreeningConsentViolation"
  }
}

/** A screening subject: the primary application row, or a co-applicant row. */
export interface ScreeningSubject {
  table: "applications" | "application_co_applicants"
  id: string
}

/** Map bundle-runner's subjectType to the table that holds that subject's consent. */
export function screeningSubjectFor(subjectType: "company" | "co_applicant", subjectId: string): ScreeningSubject {
  return { table: subjectType === "company" ? "applications" : "application_co_applicants", id: subjectId }
}

/**
 * Assert the subject has recorded stage-2 (screening) consent. Throws ScreeningConsentViolation if the
 * consent timestamp is missing — or if the consent column can't be read (fail-closed: never screen on a
 * read error). Call at the TOP of every Searchworx / FitScore / document-extraction entrypoint.
 */
export async function assertScreeningConsent(db: SupabaseClient, subject: ScreeningSubject): Promise<void> {
  const { data, error } = await db
    .from(subject.table)
    .select("stage2_consent_given_at")
    .eq("id", subject.id)
    .single()

  if (error) {
    throw new ScreeningConsentViolation(`consent check failed for ${subject.table}/${subject.id}: ${error.message}`)
  }
  if (!data?.stage2_consent_given_at) {
    throw new ScreeningConsentViolation(`screening blocked — no recorded stage-2 consent for ${subject.table}/${subject.id}`)
  }
}
