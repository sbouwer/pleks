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
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { isJuristicApplication, SURETY_PARTY_OR_FILTER } from "@/lib/applications/juristicParties"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface PartySet {
  /** Natural persons priced: residential lead + co rows, or juristic surety parties. */
  persons: number
  /** An entity line is priced (juristic). */
  entity: boolean
  /** Juristic surety party ids — the paid lines beside the entity. Empty for residential. */
  suretyIds: string[]
}

type ApplicationShape = Parameters<typeof isJuristicApplication>[0] & { id: string; org_id: string }

export async function livePartySet(
  db: SupabaseClient,
  application: ApplicationShape,
): Promise<{ ok: true; set: PartySet } | { ok: false }> {
  const juristic = isJuristicApplication(application)
  let query = db
    .from("application_co_applicants")
    .select("id")
    .eq("org_id", application.org_id)
    .eq("primary_application_id", application.id)
    .is("declined_at", null)
  if (juristic) query = query.or(SURETY_PARTY_OR_FILTER)
  const { data, error } = await query
  if (error) {
    logQueryError("livePartySet application_co_applicants", error)
    return { ok: false }
  }
  const ids = (data ?? []).map((r) => r.id as string)
  return juristic
    ? { ok: true, set: { persons: ids.length, entity: true, suretyIds: ids } }
    : { ok: true, set: { persons: 1 + ids.length, entity: false, suretyIds: [] } }
}

/** Does a stamp still price this set? A stamp that recorded no set (NULL) never matches — fail closed. */
export function stampMatches(stamp: { priced_party_count: number | null; priced_entity: boolean | null }, set: PartySet): boolean {
  return stamp.priced_party_count === set.persons && stamp.priced_entity === set.entity
}
