/**
 * app/api/billing/screening/route.ts — build a PayFast form for the applicant screening fee
 *
 * Route:  POST /api/billing/screening
 * Auth:   token — body token must be an unexpired 'shortlist_invite' application_tokens row
 * Data:   reads application_tokens, applications, listings; searchworx_rates via lib/screening/quote.ts;
 *         stamps applications fee_amount_cents + rate_effective_date / pricing_policy_version / cost_excl_vat_cents
 * Notes:  The fee is the ADDENDUM_14V formula over recorded vendor rates, stamped on the first successful POST and
 *         reused after. A JURISTIC application (pty_ltd/cc/npc/trust) is priced as the entity line + one SA bundle
 *         per surety party (N >= 0) and paid in ONE transaction. A surety is optional (Stéan 2026-10-01, BUILD_72
 *         R0) — nothing here refuses a company with none. No rate → 503, never a fallback fee.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildApplicationFeeForm } from "@/lib/payfast/forms"
import { quoteApplicationFee, stampColumns } from "@/lib/screening/quote"
import { isJuristicApplication, SURETY_PARTY_OR_FILTER } from "@/lib/applications/juristicParties"
import { logQueryError } from "@/lib/supabase/logQueryError"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/** Juristic: the entity line plus one SA bundle per surety (N >= 0). Residential: one per applicant. */
function residentialOrSuretyPersons(juristic: boolean, suretyCount: number, isJoint: boolean): number {
  if (juristic) return suretyCount
  return isJoint ? 2 : 1
}

const UNRECORDED = { error: "Could not record the screening fee" }

/**
 * STAMP AT FIRST SHOW (ADDENDUM_14V §3.5; ruled 2026-10-01: the stamp lives on applications beside
 * fee_amount_cents, and the first successful POST here is the first show). Once stamped the fee is REUSED, never
 * recomputed — a rate change between this quote and the ITN must not reprice an open payment, and the ITN
 * cross-check reads exactly this column. The 14W payable gate will narrow when the first show happens.
 */
async function stampedFee(
  supabase: ServiceClient,
  a: { applicationId: string; orgId: string; stampedCents: number | null; juristic: boolean; persons: number; isJoint: boolean },
): Promise<{ ok: true; cents: number } | { ok: false; body: Record<string, string> }> {
  if (typeof a.stampedCents === "number") return { ok: true, cents: a.stampedCents }

  const q = await quoteApplicationFee({ juristic: a.juristic, persons: a.persons }, "billing-screening")
  if (!q.ok) {
    // FAIL CLOSED (§4): no rate → no quote, never a zero or a fallback. quote.ts has already raised Sentry.
    return { ok: false, body: { error: "Screening is temporarily unavailable. Please try again later.", reason: q.reason } }
  }
  // The `.is(pricing_policy_version, null)` guard makes the stamp write-once: a concurrent POST that stamped
  // first wins, and this one re-reads its number rather than overwriting it.
  const { data: stamped, error: stampError } = await supabase.from("applications").update({
    fee_amount_cents: q.fee_cents,
    joint_fee_paid: a.isJoint,
    ...stampColumns(q),
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
      id, org_id, listing_id, has_co_applicant, entity_type, applicant_type, company_info,
      fee_amount_cents, pricing_policy_version,
      listings(asking_rent_cents, units(unit_number), properties(name))
    `)
    .eq("id", tokenData.application_id)
    .single()
    logQueryError("POST applications", applicationError)

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  const listing = application.listings as unknown as {
    asking_rent_cents: number
    units: { unit_number: string } | null
    properties: { name: string } | null
  } | null

  // JURISTIC APPLICATIONS ARE PAID AS ONE TRANSACTION: the entity's line plus one line per surety party,
  // N >= 0 — a surety is optional (Stéan 2026-10-01, BUILD_72 R0), so the sureties are not left to pay
  // separately afterwards but nobody is refused for having none. Consent stays per-person (D-14B-01).
  // `isJuristicApplication` is the SAME answer the application ITN uses to write the paid lines, and it is
  // dormant today by design — its own comment says why and which change wakes it (BUILD_72 R3).
  const juristic = isJuristicApplication(application)

  let suretyCount = 0
  if (juristic) {
    // BOTH surety markers, via the SSOT filter (M-118).
    const { count, error: suretyError } = await supabase
      .from("application_co_applicants")
      .select("id", { count: "exact", head: true })
      .eq("primary_application_id", application.id)
      .or(SURETY_PARTY_OR_FILTER)
      .is("declined_at", null)
    logQueryError("POST application_co_applicants surety count", suretyError)
    if (suretyError) {
      // Fail closed: without a reliable count we cannot price the application correctly.
      return NextResponse.json({ error: "Could not verify surety parties" }, { status: 503 })
    }
    suretyCount = count ?? 0
  }

  const isJoint = application.has_co_applicant ?? false

  const fee = await stampedFee(supabase, {
    applicationId: application.id,
    orgId: application.org_id,
    stampedCents: application.pricing_policy_version ? application.fee_amount_cents : null,
    juristic,
    persons: residentialOrSuretyPersons(juristic, suretyCount, isJoint),
    isJoint,
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
  })
}
