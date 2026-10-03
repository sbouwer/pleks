/**
 * lib/applications/juristicParties.ts — what a juristic application is, and who stands surety for it (SSOT)
 *
 * Notes:  A juristic applicant (pty_ltd / cc / npc / trust) is a separate legal person. It is screened
 *         ON ITS OWN — CIPC and the Compuscan Company Profile — and a surety is OPTIONAL: a director or
 *         trustee stands surety only when the entity alone is not strong enough, exactly as a partner is
 *         added to a single-income application (Stéan ruling 2026-10-01, BUILD_72 R0). This module owns:
 *
 *         1. Whether an application is juristic (`isJuristicApplicant`, `isJuristicApplication`).
 *         2. THE surety predicate (`isSuretyParty` / `SURETY_PARTY_OR_FILTER`) — the only legal reader
 *            of the two markers (BUILD_72 R2; `pleks/no-hand-written-surety-filter` holds it).
 *         3. The party's NAME: a DIRECTOR for a company, a TRUSTEE for a trust. The word reaches
 *            applicant-facing copy, so it is derived here rather than hardcoded per surface.
 *
 *         RETIRED 2026-10-01: "at least one surety party is REQUIRED", attributed to a Stéan ruling of
 *         2026-08-15. It entered in `396c01d8` (#228) with no quote of him, while he was unreachable, and
 *         he does not hold it. `MIN_SURETY_PARTIES`, `validateJuristicParties` and the 409
 *         `surety_party_required` at payment went with it. A citation that resolves to nothing is not a
 *         ruling, however confidently it is dated.
 *
 *         Payment is per line (ADDENDUM_14W §0): the entity's company line is the lead's payment, and each surety
 *         party pays for their own line after their own consent (`leadLineSubjectType`, lib/screening/lineFee.ts).
 *         CONSENT stays strictly per-person — D-14B-01, no proxy consent.
 */
import { isJuristicCompanyType } from "@/lib/applications/companyTypes"

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
 * Is this a juristic applicant — an organisation of a juristic company type?
 *
 * `orgMarker` accepts EITHER of the two signals the codebase uses for "not an individual", because
 * callers hold different ones: `applications.entity_type` = 'organisation' (the DB column) or
 * `applicant_type` = 'company' (what assembleAssessment branches on).
 */
export function isJuristicApplicant(orgMarker: unknown, companyType: unknown): boolean {
  const isOrg = orgMarker === "organisation" || orgMarker === "company"
  return isOrg && isJuristicCompanyType(companyType)
}

/**
 * Collapse an application row's TWO org markers into the one `isJuristicApplicant` reads.
 *
 * A caller holding BOTH markers has to choose, and `entity_type ?? applicant_type` is the wrong choice:
 * `applications.entity_type` carries a column DEFAULT of 'individual', so it is never NULL and `??`
 * never falls through. A company application read that way is an individual. This resolver treats the
 * default as absent: a marker that already means "not an individual" wins, and only then does the
 * other one get consulted. (M-118.)
 */
export function orgMarkerFrom(entityType: unknown, applicantType: unknown): unknown {
  if (entityType === "organisation" || entityType === "company") return entityType
  if (applicantType === "organisation" || applicantType === "company") return applicantType
  return entityType ?? applicantType
}

/**
 * Is this application PAID FOR as juristic — the entity's line plus one per surety party?
 *
 * ONE answer for the two places that must agree: the price (`billing/screening`, via
 * `quoteApplicationFee`) and the paid lines the PayFast application ITN writes. If they disagree, the
 * applicant is charged for one set of lines and the ITN records another.
 *
 * ⚠ DELIBERATELY reads `entity_type ?? applicant_type`, NOT `orgMarkerFrom` — so it is FALSE for every
 * application today (`entity_type` defaults to 'individual' and has no writer). That holds juristic
 * PRICING dormant; it no longer holds any gate shut, because the surety gate is gone (BUILD_72 R0).
 * BUILD_72 Phase 1 (R3) switches this to `orgMarkerFrom` here, in this one place, together with
 * writing `entity_type` and re-deriving the juristic fee — so price and lines flip in the same change.
 */
export function isJuristicApplication(row: Readonly<{
  entity_type?: unknown
  applicant_type?: unknown
  company_info?: unknown
}>): boolean {
  const companyType = (row.company_info as Record<string, unknown> | null | undefined)?.companyType
  return isJuristicApplicant(row.entity_type ?? row.applicant_type, companyType)
}

/**
 * Is this application juristic for the purpose of COPY — which invite and reminder a party receives?
 *
 * Either org marker, via `orgMarkerFrom` (M-118), NOT `isJuristicApplication`'s dormant pricing reading:
 * that one is false for every application today, so it would class a company's surety as a residential
 * guarantor and send them joint-rental copy (BUILD_72 P1-R3 forbids it). SQL twin:
 * `is_juristic_party_context()` in 005; test/db/surety-party-predicate.dbtest.ts asserts they agree.
 */
export function isJuristicForCopy(row: Readonly<{ entity_type?: unknown; applicant_type?: unknown; company_info?: unknown }>): boolean {
  const companyType = (row.company_info as Record<string, unknown> | null | undefined)?.companyType
  return isJuristicApplicant(orgMarkerFrom(row.entity_type, row.applicant_type), companyType)
}

/** Which copy a co-applicant line carries (BUILD_72 P1-R3a). */
export type PartyKind = "co_applicant" | "guarantor" | "surety"

/**
 * `isSuretyParty` answers billing and uniqueness; this answers COPY, which also depends on the application.
 * A surety party on a non-juristic application is a residential `guarantor` and gets the joint-rental
 * invite; only a `surety` on a juristic application reaches the director-copy / held split (R3, R7a).
 * SQL twin: `screening_party_kind()` in 005, which is what `v_application_screening_lines.party_kind` reads.
 */
export function partyKind(input: Readonly<{ party: Parameters<typeof isSuretyParty>[0]; isJuristic: boolean }>): PartyKind {
  if (!isSuretyParty(input.party)) return "co_applicant"
  return input.isJuristic ? "surety" : "guarantor"
}

/**
 * The subject_type of the application's OWN screening line — the one the shortlist form pays (ADDENDUM_14W §0):
 * `company` for a juristic applicant, whose signatory pays the company's line for the company only; `applicant` for the
 * lead natural person of every other application (P1-R8b-1: a natural person is never a `company`). Its subject_id is
 * the application id. Every co row pays its own `co_applicant` line on its own link.
 */
export function leadLineSubjectType(application: Parameters<typeof isJuristicApplication>[0]): "company" | "applicant" {
  return isJuristicApplication(application) ? "company" : "applicant"
}

/**
 * THE surety-party predicate. Every consumer of "is this person standing surety" resolves it here.
 *
 * `application_co_applicants` denotes the role TWICE, and the two markers have different writers:
 *
 *   - `is_surety_director = true` — written by the 14G director-declaration surface until BUILD_72 Phase 1
 *     retired it (`declareDirectors` / `replaceDirector`); Phase 2's CIPC pull derives it from the registry.
 *   - `role = 'guarantor'`        — written by the apply flow's roster ("A guarantor / surety (backs
 *     the rent)"), through `POST /api/applications/[id]/co-applicant`. The one surety surface (R1).
 *
 * Reading only one marker is not stricter, it is BLIND to the other writer — billing, then the
 * application ITN and the screen route, each counted `is_surety_director` alone. (M-118.) The two
 * markers stay (different legal postures, M4); the predicate is one.
 */
export function isSuretyParty(row: Readonly<{ role?: string | null; is_surety_director?: boolean | null }>): boolean {
  return row.is_surety_director === true || row.role === "guarantor"
}

/**
 * The same set as a PostgREST `.or(...)` filter, for querying sureties without loading every row.
 *
 * It exists so a query and an in-memory test cannot drift apart — the divergence M-118 records was
 * precisely a query filter and a predicate disagreeing. Combine it with the caller's other filters
 * (`.eq("primary_application_id", …)`), which AND with it as usual.
 */
export const SURETY_PARTY_OR_FILTER = "is_surety_director.eq.true,role.eq.guarantor"

/**
 * Did the applicant SAY this surety holds the office its entity type has — a company's director, a trust's trustee,
 * a CC's member? `suretyInviteRole` reads it to pick the invite's role sentence; any other surety is sent the
 * generic one (A).
 *
 * `declared_director` ALONE (Stéan ruling on #332, 2026-10-03, correcting P1-R7a): counsel reviewed the office
 * sentences for a person somebody SAID holds the office. The registry flag `is_surety_director` is a different fact
 * and never selects copy — where it disagrees with the answer, `directorDeclarationDiscrepancy` records that for the
 * agent and for Phase 2's reconciliation. `pleks/no-hand-written-surety-filter` holds query filters on either
 * column. SQL twin: `is_director_surety()` in 005.
 */
export function isDirectorSurety(row: Readonly<{ role?: string | null; is_surety_director?: boolean | null; declared_director?: boolean | null }>): boolean {
  return isSuretyParty(row) && row.declared_director === true
}

/**
 * The registry and the applicant DISAGREE about this surety's office: the registry flag says yes, and the applicant
 * did not (answered no, or was never asked). Ruled 2026-10-03: a registry match is not a "yes". The invite therefore
 * went out with the generic sentence, the agent is shown this, and Phase 2's registry reconciliation picks it up.
 * Derived from the two recorded facts rather than stored: a stored copy of a function of two columns can only drift.
 * The other direction (a "yes" the registry does not show) is not flagged — until Phase 2 runs, a false registry
 * flag means "not checked", not "checked and absent".
 */
export function directorDeclarationDiscrepancy(row: Readonly<{ role?: string | null; is_surety_director?: boolean | null; declared_director?: boolean | null }>): boolean {
  return isSuretyParty(row) && row.is_surety_director === true && row.declared_director !== true
}

/** What the agent is shown for a `directorDeclarationDiscrepancy` party. */
export function directorDiscrepancyNotice(): string {
  return "The registry lists this person as holding office in the entity, but the applicant did not say so. Their invite used the general wording. Unreconciled."
}

/**
 * The noun the applicant is asked about a surety, by entity type (BUILD_72 P1-R7, CD 2026-10-01): "Is this person a
 * director / trustee / member of the …?". The answer is stored in `declared_director` whatever the noun — the column
 * name stays, the concept ("holds the office that entity type has") is in its column comment in 005.
 * Null = not a juristic type, so the question is not asked.
 */
export type SuretyQuestionNoun = "director" | "trustee" | "member"
export function suretyQuestionNoun(companyType: unknown): SuretyQuestionNoun | null {
  if (companyType === "pty_ltd" || companyType === "npc") return "director"
  if (companyType === "trust") return "trustee"
  if (companyType === "cc") return "member"
  return null
}

/** The question, phrased for the entity, for the roster's add dialog and the company-parties rows. */
export function suretyQuestion(companyType: unknown): string {
  const noun = suretyQuestionNoun(companyType)
  if (noun === "trustee") return "Are they a trustee of the trust?"
  if (noun === "member") return "Are they a member of the close corporation?"
  return "Are they a director of the company?"
}

/** The application facts every invite decision reads: juristic-ness AND which juristic type. */
type InviteApplication = Parameters<typeof isJuristicForCopy>[0]
type InviteInput = Readonly<{ party: Parameters<typeof isDirectorSurety>[0]; application: InviteApplication }>

/**
 * Which counsel-approved ROLE SENTENCE a juristic surety's invite carries, or null when the party is not a juristic
 * surety (counsel-approved comms 2026-10-03 §1, routing per counsel Q2). The office is the applicant's "yes"
 * (`isDirectorSurety` — never the registry flag alone), and the entity type names the office:
 * a company director → `director`; a trustee → `trustee` (variant B); a CC member → `member` (C). Every other
 * natural-person surety → `generic` (A) — including a "no" and an unanswered question, because a "no" to the
 * trustee/member question never infers another capacity, and A asserts none.
 */
export type SuretyInviteRole = "director" | "generic" | "trustee" | "member"
export function suretyInviteRole(input: InviteInput): SuretyInviteRole | null {
  if (partyKind({ party: input.party, isJuristic: isJuristicForCopy(input.application) }) !== "surety") return null
  const companyType = (input.application.company_info as Record<string, unknown> | null | undefined)?.companyType
  const noun = suretyQuestionNoun(companyType)
  if (noun === null) return null
  return isDirectorSurety(input.party) ? noun : "generic"
}

/**
 * Why a party's invite is HELD, or null (BUILD_72 P1-R3). A juristic surety is held only when no approved role
 * sentence fits it. RELEASED 2026-10-03 for the A/B/C audiences: until counsel approved the generic, trustee and CC
 * member sentences, only a company's director had reviewed copy and every other juristic surety was held here. Since
 * `suretyInviteRole` now answers every juristic type, this holds nobody; it stays as the one place a future audience
 * without approved copy is held, and every hold reader (pricing, the agent page, the lead's notice) still asks it.
 */
export type InviteHold = "awaiting_template"
export function inviteHold(input: InviteInput): InviteHold | null {
  const isJuristic = isJuristicForCopy(input.application)
  if (partyKind({ party: input.party, isJuristic }) !== "surety") return null
  return suretyInviteRole(input) === null ? "awaiting_template" : null
}

/**
 * Which invite a party is SENT, by every sender: the roster's first invite, the co-parties Resend and the reminder
 * cron. One answer, because the walker found the first two each choosing their own copy (one always joint-rental,
 * one always director) while the cron alone routed by kind. `surety` = `application.director_invited`, with the role
 * sentence `suretyInviteRole` picks; `co_applicant` = `application.co_applicant_invited` (a joint co-applicant or a
 * residential guarantor, R3a); `held` = nothing is sent (R3).
 */
export type InviteRoute = "surety" | "co_applicant" | "held"
export function inviteRoute(input: InviteInput): InviteRoute {
  if (inviteHold(input)) return "held"
  return partyKind({ party: input.party, isJuristic: isJuristicForCopy(input.application) }) === "surety" ? "surety" : "co_applicant"
}

/**
 * Why a held party is held, for the agent AND the lead (P1-R3 / R3b). One text since 2026-10-03: the per-answer
 * messages (not a director / trustee / member, or unanswered) RETIRED with the A/B/C release — each of those parties
 * now has an approved role sentence and is invited. What can still be held is a surety no approved sentence fits.
 */
export function heldPartyReason(): string {
  return "Invite held: no approved invite wording exists for this party yet."
}

/** BUILD_72 P1-R3b's ruled line: a held party is outside the screening, and both the agent and the lead are told so. */
export function heldPartiesNotice(count: number): string {
  return `${count} ${count === 1 ? "party" : "parties"} held — not included in this screening`
}
