/**
 * lib/applications/juristicParties.ts — the accompanying-party rule for juristic applications (SSOT)
 *
 * Notes:  A juristic applicant (pty_ltd / cc / npc / trust) is a separate legal person and cannot be
 *         screened on its own: the entity has no consumer credit profile, so the surety human(s) behind
 *         it are what the FitScore is actually assessing. This module owns TWO things that were
 *         previously implicit and inconsistent:
 *
 *         1. AT LEAST ONE accompanying surety party is REQUIRED (Stéan ruling 2026-08-15). A Pty
 *            application with zero directors could previously be created and paid for, producing a
 *            company line with nothing to screen against.
 *         2. The party is called a DIRECTOR for a company and a TRUSTEE for a trust. The rule is the
 *            same; the word is not, and it reaches applicant-facing copy — so it is derived here rather
 *            than hardcoded per-surface.
 *
 *         Payment for the entity + its surety parties is ONE transaction (see screeningFeeCents).
 *         CONSENT stays strictly per-person — D-14B-01, no proxy consent — and that separation is the
 *         point: paying is a commercial act anyone can perform, consenting is not.
 */
import { isJuristicCompanyType } from "@/lib/applications/companyTypes"

/** Minimum surety humans that must accompany a juristic application. */
export const MIN_SURETY_PARTIES = 1

export type SuretyPartyLabel = "director" | "trustee" | "representative"

/**
 * What the accompanying human is CALLED for this entity type. A trust has trustees; a company has
 * directors. Using "director" for a trust is wrong in a legal document and reads as sloppy to an
 * applicant who is, in fact, a trustee.
 */
export function suretyPartyLabel(companyType: unknown): SuretyPartyLabel {
  if (companyType === "trust") return "trustee"
  if (companyType === "pty_ltd" || companyType === "cc" || companyType === "npc") return "director"
  return "representative"
}

/** Plural form, for copy that counts them. */
export function suretyPartyLabelPlural(companyType: unknown): string {
  return `${suretyPartyLabel(companyType)}s`
}

/**
 * Does this application need at least one accompanying surety party before it can be paid for?
 *
 * `orgMarker` accepts EITHER of the two signals the codebase uses for "not an individual", because
 * callers hold different ones: `applications.entity_type` = 'organisation' (the DB column) or
 * `applicant_type` = 'company' (what assembleAssessment branches on). Accepting both means this gate
 * cannot be silently bypassed by a caller that happens to hold the other one.
 */
export function requiresSuretyParty(orgMarker: unknown, companyType: unknown): boolean {
  const isOrg = orgMarker === "organisation" || orgMarker === "company"
  return isOrg && isJuristicCompanyType(companyType)
}

export interface JuristicPartyValidation {
  readonly ok: boolean
  /** Applicant-facing, already using the right word for the entity type. */
  readonly error?: string
}

/**
 * Gate a juristic application on having its surety party/parties declared. Returns ok for every
 * non-juristic application — an individual or an unincorporated applicant (sole proprietor,
 * partnership) IS the human, so there is nobody to accompany them.
 */
export function validateJuristicParties(input: {
  /** applications.entity_type ('organisation') OR applicant_type ('company') — either is accepted. */
  readonly entityType: unknown
  readonly companyType: unknown
  readonly suretyCount: number
}): JuristicPartyValidation {
  if (!requiresSuretyParty(input.entityType, input.companyType)) return { ok: true }
  if (input.suretyCount >= MIN_SURETY_PARTIES) return { ok: true }

  const label = suretyPartyLabel(input.companyType)
  return {
    ok: false,
    error: `A ${input.companyType === "trust" ? "trust" : "company"} application must include at least one ${label} who signs surety. Add a ${label} before continuing to payment.`,
  }
}
