/**
 * app/api/billing/screening/route.ts — build a PayFast form for the applicant screening fee
 *
 * Route:  POST /api/billing/screening
 * Auth:   token — body token must be an unexpired 'shortlist_invite' application_tokens row
 * Data:   reads application_tokens, applications, listings; searchworx_rates via lib/screening/quote.ts;
 *         stamps applications fee_amount_cents + rate_effective_date / pricing_policy_version / cost_excl_vat_cents
 *         + the party set it priced (priced_party_count / priced_entity, §3.5a — lib/screening/partySet.ts)
 * Notes:  The fee is the ADDENDUM_14V formula over recorded vendor rates, stamped on the first successful POST and
 *         reused after. A JURISTIC application (pty_ltd/cc/npc/trust) is priced as the entity line + one SA bundle
 *         per surety party (N >= 0) and paid in ONE transaction. A surety is optional (Stéan 2026-10-01, BUILD_72
 *         R0) — nothing here refuses a company with none. No rate → 503, never a fallback fee.
 *         14W PAYABILITY GATE (BUILD_72 P1-R8b-4): refused 409 until EVERY priced party has stage-2 consent
 *         (`awaitingConsent`, the one predicate), naming who is outstanding — checked BEFORE the stamp, so the first
 *         show of the fee is the moment it becomes payable, and the ITN never writes a paid-but-unconsented line.
 *         P1-R3b: a HELD party is outside the set (lib/screening/partySet.ts) — not priced, not counted, not awaited —
 *         and is returned in `held` (name + reason) on both the 200 and the 409, so the lead sees who is not included.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildApplicationFeeForm } from "@/lib/payfast/forms"
import { quoteApplicationFee, stampColumns } from "@/lib/screening/quote"
import { awaitingConsent, livePartySet, stampMatches, type AwaitingConsent, type PartySet } from "@/lib/screening/partySet"
import { logQueryError } from "@/lib/supabase/logQueryError"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

type StampRow = {
  fee_amount_cents: number | null
  pricing_policy_version: string | null
  priced_party_count: number | null
  priced_entity: boolean | null
}

const VOID = {
  fee_amount_cents: null, rate_effective_date: null, pricing_policy_version: null,
  cost_excl_vat_cents: null, priced_party_count: null, priced_entity: null,
}

const UNRECORDED = { error: "Could not record the screening fee" }

/** The refusal names who is outstanding — the lead as "you", every other party by name. */
function awaitingConsentMessage(waiting: AwaitingConsent[]): string {
  const lead = waiting.some((w) => w.subject_type === "applicant")
  const others = waiting.filter((w) => w.subject_type === "co_applicant").map((w) => w.name ?? "a co-applicant")
  const names = [...(lead ? ["you"] : []), ...others]
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]
  return `Screening can be paid once everyone on this application has given screening consent. Still waiting on: ${list}.`
}

/**
 * STAMP AT FIRST SHOW (ADDENDUM_14V §3.5; ruled 2026-10-01: the stamp lives on applications beside
 * fee_amount_cents, and the first successful POST here is the first show). Once stamped the fee is REUSED, never
 * recomputed — a rate change between this quote and the ITN must not reprice an open payment, and the ITN
 * cross-check reads exactly this column. The 14W payable gate will narrow when the first show happens.
 *
 * §3.5a: the stamp is bound to the PARTY SET it priced (priced_party_count, priced_entity). The DB trigger voids it
 * when the set changes; a stamp that still disagrees with the live set here (a party added between this route's
 * count and its stamp) is voided the same way and re-quoted — never reused for a set it did not price.
 */
async function stampedFee(
  supabase: ServiceClient,
  a: { applicationId: string; orgId: string; stamp: StampRow; set: PartySet },
): Promise<{ ok: true; cents: number } | { ok: false; body: Record<string, string> }> {
  if (a.stamp.pricing_policy_version && typeof a.stamp.fee_amount_cents === "number") {
    if (stampMatches(a.stamp, a.set)) return { ok: true, cents: a.stamp.fee_amount_cents }
    const { error: voidError } = await supabase.from("applications").update(VOID)
      .eq("id", a.applicationId).eq("org_id", a.orgId).is("fee_paid_at", null)
    if (voidError) {
      logQueryError("POST applications stale stamp void", voidError)
      return { ok: false, body: UNRECORDED }
    }
  }

  const q = await quoteApplicationFee({ juristic: a.set.entity, persons: a.set.persons }, "billing-screening")
  if (!q.ok) {
    // FAIL CLOSED (§4): no rate → no quote, never a zero or a fallback. quote.ts has already raised Sentry.
    return { ok: false, body: { error: "Screening is temporarily unavailable. Please try again later.", reason: q.reason } }
  }
  // The `.is(pricing_policy_version, null)` guard makes the stamp write-once: a concurrent POST that stamped
  // first wins, and this one re-reads its number rather than overwriting it.
  const { data: stamped, error: stampError } = await supabase.from("applications").update({
    fee_amount_cents: q.fee_cents,
    joint_fee_paid: !a.set.entity && a.set.persons > 1,
    ...stampColumns(q),
    priced_party_count: a.set.persons,
    priced_entity: a.set.entity,
  }).eq("id", a.applicationId).eq("org_id", a.orgId).is("pricing_policy_version", null).select("fee_amount_cents")
  if (stampError) {
    logQueryError("POST applications fee stamp", stampError)
    return { ok: false, body: UNRECORDED }
  }
  if (stamped && stamped.length > 0) return { ok: true, cents: q.fee_cents }

  const { data: winner, error: winnerError } = await supabase
    .from("applications").select("fee_amount_cents").eq("id", a.applicationId).eq("org_id", a.orgId).single()
  logQueryError("POST applications fee stamp re-read", winnerError)
  if (winnerError || typeof winner?.fee_amount_cents !== "number") return { ok: false, body: UNRECORDED }
  return { ok: true, cents: winner.fee_amount_cents }
}

export async function POST(req: NextRequest) {
  const { token } = await req.json()

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Look up application from token
  const { data: tokenData, error: tokenDataError } = await supabase
    .from("application_tokens")
    .select("application_id, applicant_email, expires_at")
    .eq("token", token)
    .eq("token_type", "shortlist_invite")
    .single()
    logQueryError("POST application_tokens", tokenDataError)

  if (!tokenData) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 })
  }

  if (new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 410 })
  }

  // Get application details
  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select(`
      id, org_id, listing_id, has_co_applicant, entity_type, applicant_type, company_info, stage2_consent_given_at,
      fee_amount_cents, pricing_policy_version, priced_party_count, priced_entity, fee_paid_at,
      listings(asking_rent_cents, units(unit_number), properties(name))
    `)
    .eq("id", tokenData.application_id)
    .single()
    logQueryError("POST applications", applicationError)

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  // A PAID application is never re-quoted and never offered a second form. Rows paid before 14V carry no stamp,
  // so without this the first POST after deploy would quote afresh and overwrite the fee the applicant actually
  // paid (walker F2, .handoff/14v-rate-engine/11-walker.md). fee_paid_at, not fee_status: 'refunded' is also
  // "not paid" by status, and a refunded fee is still one that was paid.
  if (application.fee_paid_at) {
    return NextResponse.json({ error: "This screening fee has already been paid." }, { status: 409 })
  }

  const listing = application.listings as unknown as {
    asking_rent_cents: number
    units: { unit_number: string } | null
    properties: { name: string } | null
  } | null

  // JURISTIC APPLICATIONS ARE PAID AS ONE TRANSACTION: the entity's line plus one line per surety party,
  // N >= 0 — a surety is optional (Stéan 2026-10-01, BUILD_72 R0), so the sureties are not left to pay
  // separately afterwards but nobody is refused for having none. Consent stays per-person (D-14B-01).
  // The set is the one the ITN checks the stamp against (lib/screening/partySet.ts, §3.5a/b).
  const party = await livePartySet(supabase, application)
  if (!party.ok) {
    // Fail closed: without a reliable count we cannot price the application correctly.
    return NextResponse.json({ error: "Could not verify the parties to this application" }, { status: 503 })
  }
  const isJoint = !party.set.entity && party.set.persons > 1
  const held = party.set.held.map((h) => ({ name: h.name, reason: h.reason }))

  // 14W: not payable until every priced party has consented to their own screening (P1-R8b-4).
  const waiting = awaitingConsent(application, party.set)
  if (waiting.length > 0) {
    return NextResponse.json({
      error: awaitingConsentMessage(waiting),
      reason: "awaiting_consent",
      awaiting: waiting.map((w) => ({ subject_type: w.subject_type, name: w.name })),
      held,
    }, { status: 409 })
  }

  const fee = await stampedFee(supabase, {
    applicationId: application.id,
    orgId: application.org_id,
    stamp: application,
    set: party.set,
  })
  if (!fee.ok) return NextResponse.json(fee.body, { status: 503 })
  const feeCents = fee.cents

  const form = buildApplicationFeeForm({
    applicationId: application.id,
    listingId: application.listing_id,
    orgId: application.org_id,
    propertyName: listing?.properties?.name ?? "Property",
    unitName: listing?.units?.unit_number ?? "",
    feeCents,
  })

  return NextResponse.json({
    payfast_url: form.url,
    payfast_data: form.data,
    fee_cents: feeCents,
    is_joint: isJoint,
    held,
  })
}
