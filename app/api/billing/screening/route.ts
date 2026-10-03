/**
 * app/api/billing/screening/route.ts — build a PayFast form for the lead's OWN screening line
 *
 * Route:  POST /api/billing/screening
 * Auth:   token — body token must be an unexpired 'shortlist_invite' application_tokens row
 * Data:   reads application_tokens, applications, listings; stamps the lead line's application_screening_payments row
 *         through lib/screening/lineFee.ts (searchworx_rates via lib/screening/quote.ts)
 * Notes:  ADDENDUM_14W §0 (per-person pay-and-receive): this form pays for ONE line — the lead's own check, or, on a
 *         juristic application, the company's line, which the signatory pays for the company only. Every co-applicant,
 *         guarantor and surety pays their own line on their own link (the director-portal pay step). Nobody fronts
 *         money for anyone, so nothing here counts, prices or waits on another party.
 *         CONSENT FIRST, per line: refused 409 until this line's own stage-2 consent is recorded
 *         (applications.stage2_consent_given_at — the lead's, or the signatory's for the company), checked BEFORE the
 *         stamp, so the first show of the fee is the moment it becomes payable. No rate → 503, never a fallback fee.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildApplicationFeeForm } from "@/lib/payfast/forms"
import { leadLineSubjectType } from "@/lib/applications/juristicParties"
import { stampLineFee } from "@/lib/screening/lineFee"
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
      id, org_id, listing_id, entity_type, applicant_type, company_info, stage2_consent_given_at, fee_paid_at,
      listings(asking_rent_cents, units(unit_number), properties(name))
    `)
    .eq("id", tokenData.application_id)
    .single()
    logQueryError("POST applications", applicationError)

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  // A PAID line is never re-quoted and never offered a second form. fee_paid_at is the lead line's paid stamp (the ITN
  // writes it); a line paid before §0 has it too, so this also covers every application paid under the pooled form.
  if (application.fee_paid_at) {
    return NextResponse.json({ error: "This screening fee has already been paid." }, { status: 409 })
  }

  // 14W §0: consent → pay → run, per line. Only THIS line's consent is read; nobody else's is a condition.
  if (!application.stage2_consent_given_at) {
    return NextResponse.json({
      error: "Give your screening consent first — payment follows it.",
      reason: "awaiting_consent",
    }, { status: 409 })
  }

  const fee = await stampLineFee(supabase, {
    orgId: application.org_id,
    applicationId: application.id,
    subjectType: leadLineSubjectType(application),
    subjectId: application.id,
  }, "billing-screening")
  if (!fee.ok) {
    if (fee.reason === "paid") return NextResponse.json({ error: "This screening fee has already been paid." }, { status: 409 })
    if (fee.reason === "rates_unavailable") {
      return NextResponse.json({ error: "Screening is temporarily unavailable. Please try again later.", reason: fee.reason }, { status: 503 })
    }
    return NextResponse.json({ error: "Could not record the screening fee" }, { status: 503 })
  }

  const listing = application.listings as unknown as {
    asking_rent_cents: number
    units: { unit_number: string } | null
    properties: { name: string } | null
  } | null

  const form = buildApplicationFeeForm({
    applicationId: application.id,
    listingId: application.listing_id,
    orgId: application.org_id,
    propertyName: listing?.properties?.name ?? "Property",
    unitName: listing?.units?.unit_number ?? "",
    feeCents: fee.cents,
  })

  return NextResponse.json({
    payfast_url: form.url,
    payfast_data: form.data,
    fee_cents: fee.cents,
  })
}
