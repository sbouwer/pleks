/**
 * app/api/billing/screening/route.ts — build a PayFast form for the applicant screening fee
 *
 * Route:  POST /api/billing/screening
 * Auth:   token — body token must be an unexpired 'shortlist_invite' application_tokens row
 * Data:   reads application_tokens, applications, listings; updates applications fee fields
 * Notes:  Fee comes from screeningFeeCents. A JURISTIC application (pty_ltd/cc/npc/trust) is priced as
 *         the entity line + one line per surety director/trustee and paid in ONE transaction; it is
 *         REFUSED (409 surety_party_required) until at least one surety party is declared. Individual
 *         applications stay R250 single / R470 joint.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildApplicationFeeForm } from "@/lib/payfast/forms"
import { screeningFeeCents } from "@/lib/constants"
import { requiresSuretyParty, validateJuristicParties } from "@/lib/applications/juristicParties"
import { logQueryError } from "@/lib/supabase/logQueryError"

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

  // JURISTIC APPLICATIONS ARE PAID AS ONE TRANSACTION (Stéan ruling 2026-08-15): the entity's line plus
  // one line per surety director/trustee. A juristic applicant has no consumer credit profile of its own,
  // so screening the company without a surety human screens nothing — hence at least one is REQUIRED, and
  // the sureties are not left to pay separately afterwards. Consent stays per-person (D-14B-01).
  const companyType = (application.company_info as Record<string, unknown> | null)?.companyType
  const orgMarker = application.entity_type ?? application.applicant_type
  const juristic = requiresSuretyParty(orgMarker, companyType)

  let suretyCount = 0
  if (juristic) {
    const { count, error: suretyError } = await supabase
      .from("application_co_applicants")
      .select("id", { count: "exact", head: true })
      .eq("primary_application_id", application.id)
      .eq("is_surety_director", true)
      .is("declined_at", null)
    logQueryError("POST application_co_applicants surety count", suretyError)
    if (suretyError) {
      // Fail closed: without a reliable count we cannot price the application correctly.
      return NextResponse.json({ error: "Could not verify surety parties" }, { status: 503 })
    }
    suretyCount = count ?? 0

    const gate = validateJuristicParties({ entityType: orgMarker, companyType, suretyCount })
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: "surety_party_required" }, { status: 409 })
    }
  }

  const isJoint = application.has_co_applicant ?? false
  const feeCents = screeningFeeCents({ isJuristic: juristic, suretyCount, hasCoApplicant: isJoint })

  // Update fee amount on application
  // eslint-disable-next-line pleks/require-org-scope-on-service-write -- token-scoped: application.id resolves from application_tokens (validated shortlist_invite token, unexpired) above — the token is the credential, not a caller-supplied org id
  await supabase.from("applications").update({
    fee_amount_cents: feeCents,
    joint_fee_paid: isJoint,
  }).eq("id", application.id)

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
