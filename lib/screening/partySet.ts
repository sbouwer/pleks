/**
 * lib/screening/partySet.ts — the live party set an application's screening fee prices (ADDENDUM_14V §3.5a/b)
 *
 * Data:   application_co_applicants (live = declined_at IS NULL), org-scoped
 * Notes:  ONE reader for both ends of the payment: POST /api/billing/screening stamps the quote from it, and the
 *         application ITN refuses a payment when it no longer matches the stamp. Two counts were how F1 happened —
 *         the route priced `has_co_applicant ? 2 : 1` while the ITN recounted sureties live.
 *         · Residential: 1 + every live co row (co-applicants and guarantors alike). Counted, never flagged —
 *           has_co_applicant is set once, never cleared, and cannot say three (§3.5b).
 *         · Juristic: the entity line + every live surety party, through the one surety filter (M-118).
 *         The DB trigger trg_co_applicant_party_set voids a quote whenever this set changes; this module is what
 *         the app reads to price it and to check it, not a second guard.
 *         BUILD_72 P1-R8a/R8b: the set also names its co ids for EVERY application type (the ITN writes one payment
 *         row per natural person priced), and `awaitingConsent` is THE stage-2 payability predicate (14W) — a
 *         priced party without stage-2 consent makes the application unpayable.
 *         BUILD_72 P1-R3b: a HELD party (inviteHold — a juristic surety whose invite copy is still with counsel) is
 *         OUTSIDE the set: not priced, not counted, not a payability blocker — a party who cannot be invited cannot be
 *         priced. It is reported in `held` so the agent and the lead are told, never silently dropped. The exclusion
 *         is inviteHold's answer, which reads the one surety predicate (isSuretyParty) — not a second filter. When a
 *         hold lifts after payment, that party is a late party on a paid application (`isLateParty`, 14V §3.5b).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { heldPartyReason, inviteHold, isJuristicApplication, SURETY_PARTY_OR_FILTER } from "@/lib/applications/juristicParties"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface PartySet {
  /** Natural persons priced: residential lead + co rows, or juristic surety parties. */
  persons: number
  /** An entity line is priced (juristic). */
  entity: boolean
  /** The priced party rows — juristic surety parties, or every live residential co row (P1-R8a). */
  coIds: string[]
  /** The same rows, for the stage-2 payability predicate (`awaitingConsent`). */
  coParties: { id: string; name: string | null; consented: boolean }[]
  /** Live parties outside the set because their invite is held (P1-R3b) — shown, never priced. */
  held: { id: string; name: string | null; reason: string }[]
}

type ApplicationShape = Parameters<typeof isJuristicApplication>[0] & { id: string; org_id: string }

const nameOf = (r: { first_name?: unknown; last_name?: unknown }) => [r.first_name, r.last_name].filter(Boolean).join(" ") || null

export async function livePartySet(
  db: SupabaseClient,
  application: ApplicationShape,
): Promise<{ ok: true; set: PartySet } | { ok: false }> {
  const juristic = isJuristicApplication(application)
  let query = db
    .from("application_co_applicants")
    .select("id, first_name, last_name, stage2_consent_given_at, role, is_surety_director, declared_director")
    .eq("org_id", application.org_id)
    .eq("primary_application_id", application.id)
    .is("declined_at", null)
  if (juristic) query = query.or(SURETY_PARTY_OR_FILTER)
  const { data, error } = await query
  if (error) {
    logQueryError("livePartySet application_co_applicants", error)
    return { ok: false }
  }
  const rows = data ?? []
  const isHeld = (r: (typeof rows)[number]) => inviteHold({ party: r, application }) !== null
  const held = rows.filter(isHeld).map((r) => ({ id: r.id as string, name: nameOf(r), reason: heldPartyReason() }))
  const coParties = rows.filter((r) => !isHeld(r)).map((r) => ({ id: r.id as string, name: nameOf(r), consented: !!r.stage2_consent_given_at }))
  const coIds = coParties.map((p) => p.id)
  return juristic
    ? { ok: true, set: { persons: coIds.length, entity: true, coIds, coParties, held } }
    : { ok: true, set: { persons: 1 + coIds.length, entity: false, coIds, coParties, held } }
}

/**
 * A late party on a PAID application (ADDENDUM_14V §3.5b, BUILD_72 P1-R3b): the payment priced a set this party was not
 * in — in practice a held surety whose hold lifted after payment. Refused on this application until 14W's per-party
 * line exists: not invited, not reminded, no consent recorded. The test is the payment's own record — a paid
 * application with no payment row for this party — so it needs no copy of the hold rule. `{ ok: false }` = the read
 * failed; callers refuse (fail closed).
 */
export async function isLateParty(
  db: SupabaseClient,
  party: { orgId: string; applicationId: string; coApplicantId: string },
): Promise<{ ok: true; late: boolean } | { ok: false }> {
  const { data: app, error } = await db.from("applications").select("fee_paid_at")
    .eq("id", party.applicationId).eq("org_id", party.orgId).maybeSingle()
  if (error || !app) {
    logQueryError("isLateParty applications", error)
    return { ok: false }
  }
  if (!app.fee_paid_at) return { ok: true, late: false }
  const { data: paid, error: payErr } = await db.from("application_screening_payments").select("id")
    .eq("org_id", party.orgId).eq("application_id", party.applicationId)
    .eq("subject_type", "co_applicant").eq("subject_id", party.coApplicantId).limit(1)
  if (payErr) {
    logQueryError("isLateParty application_screening_payments", payErr)
    return { ok: false }
  }
  return { ok: true, late: (paid ?? []).length === 0 }
}

/** A priced party that has not given stage-2 (screening) consent. `applicant` = the application row's own subject. */
export interface AwaitingConsent {
  subject_type: "applicant" | "co_applicant"
  id: string
  name: string | null
}

/**
 * THE stage-2 payability predicate (BUILD_72 P1-R8b-4, ADDENDUM_14W): every party the fee prices must have recorded
 * stage-2 consent before the application can be paid — the application's own subject (lead or entity line,
 * `applications.stage2_consent_given_at`) and every priced party row. Empty = payable. Without it the ITN writes
 * paid rows ahead of consent — `paid_pending_consent`, the state 14W retires.
 */
export function awaitingConsent(
  application: { id: string; stage2_consent_given_at: string | null },
  set: PartySet,
): AwaitingConsent[] {
  const lead: AwaitingConsent[] = application.stage2_consent_given_at
    ? []
    : [{ subject_type: "applicant", id: application.id, name: null }]
  return [
    ...lead,
    ...set.coParties.filter((p) => !p.consented).map((p) => ({ subject_type: "co_applicant" as const, id: p.id, name: p.name })),
  ]
}

/** Does a stamp still price this set? A stamp that recorded no set (NULL) never matches — fail closed. */
export function stampMatches(stamp: { priced_party_count: number | null; priced_entity: boolean | null }, set: PartySet): boolean {
  return stamp.priced_party_count === set.persons && stamp.priced_entity === set.entity
}
