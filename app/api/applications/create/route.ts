/**
 * POST /api/applications/create
 * Creates application record + access token from Step 1 (details form).
 * Returns { applicationId, token } for client to redirect to /documents.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, string>
  const service = getServiceClient()

  // Validate slug → find listing
  const { data: listing } = await service
    .from("listings")
    .select("id, org_id, unit_id, property_id, asking_rent_cents")
    .eq("public_slug", body.slug)
    .eq("status", "active")
    .maybeSingle()

  if (!listing) {
    return NextResponse.json({ error: "Listing not found or no longer active" }, { status: 404 })
  }

  const incomeCents = body.gross_monthly_income
    ? Math.round(parseFloat(body.gross_monthly_income) * 100)
    : null

  // Create application
  const { data: application, error: appErr } = await service
    .from("applications")
    .insert({
      org_id: listing.org_id,
      listing_id: listing.id,
      unit_id: listing.unit_id,
      first_name: body.first_name,
      last_name: body.last_name,
      applicant_email: body.email,
      applicant_phone: body.phone,
      id_type: body.id_type,
      id_number: body.id_number,
      date_of_birth: body.date_of_birth || null,
      nationality: body.nationality || null,
      permit_type: body.permit_type || null,
      permit_number: body.permit_number || null,
      permit_expiry_date: body.permit_expiry_date || null,
      is_foreign_national: body.id_type !== "sa_id",
      employment_type: body.employment_type,
      employer_name: body.employer_name || null,
      gross_monthly_income_cents: incomeCents,
      applicant_motivation: body.motivation || null,
      stage1_status: "pending_documents",
    })
    .select("id")
    .single()

  if (appErr || !application) {
    console.error("[applications/create]", appErr)
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 })
  }

  // Create access token (30-day resumable)
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await service.from("application_tokens").insert({
    application_id: application.id,
    token,
    token_type: "application",
    applicant_email: body.email,
    expires_at: expiresAt,
  })

  return NextResponse.json({ applicationId: application.id, token })
}
