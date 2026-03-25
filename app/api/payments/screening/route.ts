import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildApplicationFeeForm } from "@/lib/payfast/forms"
import { APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"

export async function POST(req: NextRequest) {
  const { token } = await req.json()

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Look up application from token
  const { data: tokenData } = await supabase
    .from("application_tokens")
    .select("application_id, applicant_email, expires_at")
    .eq("token", token)
    .eq("token_type", "shortlist_invite")
    .single()

  if (!tokenData) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 })
  }

  if (new Date(tokenData.expires_at) < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 410 })
  }

  // Get application details
  const { data: application } = await supabase
    .from("applications")
    .select(`
      id, org_id, listing_id, has_co_applicant,
      listings(asking_rent_cents, units(unit_number), properties(name))
    `)
    .eq("id", tokenData.application_id)
    .single()

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  const listing = application.listings as unknown as {
    asking_rent_cents: number
    units: { unit_number: string } | null
    properties: { name: string } | null
  } | null

  const isJoint = application.has_co_applicant ?? false
  const feeCents = isJoint ? JOINT_APPLICATION_FEE_CENTS : APPLICATION_FEE_CENTS

  // Update fee amount on application
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
  })

  return NextResponse.json({
    payfast_url: form.url,
    payfast_data: form.data,
    fee_cents: feeCents,
    is_joint: isJoint,
  })
}
