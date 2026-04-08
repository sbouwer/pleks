/**
 * POST /api/applications/[id]/submit
 * Finalises application submission:
 * 1. Records POPIA Stage 1 consent
 * 2. Calculates pre-screen score
 * 3. Updates status → pre_screen_complete
 * 4. Sends Email 1 (applicant confirmation) + Email 2 (agent notification)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { calculatePrescreen } from "@/lib/applications/prescreen"
import { sendApplicationReceived, sendAgentApplicationNotification } from "@/lib/applications/emails"
import { buildBranding } from "@/lib/comms/send-email"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface Props { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  const { id } = await params
  const body = await req.json() as { token: string; consentIp?: string }
  const service = getServiceClient()

  // Validate token belongs to this application
  const { data: tokenRow } = await service
    .from("application_tokens")
    .select("application_id, applicant_email")
    .eq("token", body.token)
    .eq("application_id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }

  // Fetch application + listing
  const { data: app } = await service
    .from("applications")
    .select("*, listings(id, public_slug, asking_rent_cents, applications_count, units(unit_number, properties(id, name, city, managing_agent_id)), org_id)")
    .eq("id", id)
    .single()

  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const listing = app.listings as Record<string, unknown> | null
  const unit = listing?.units as Record<string, unknown> | null
  const property = unit?.properties as Record<string, unknown> | null

  // Calculate pre-screen score
  const bankData = app.bank_statement_extracted as Record<string, unknown> | null
  const prescreen = calculatePrescreen(
    app.gross_monthly_income_cents as number | null,
    (listing?.asking_rent_cents as number) ?? 0,
    app.employment_type as string | null,
    (bankData?.avg_monthly_income_cents as number | null) ?? null,
    !!(app.current_landlord_phone),
    !!(app.reason_for_moving)
  )

  const now = new Date().toISOString()

  // Update application
  await service.from("applications").update({
    stage1_status: "pre_screen_complete",
    stage1_consent_given: true,
    stage1_consent_given_at: now,
    stage1_consent_ip: body.consentIp ?? null,
    prescreen_score: prescreen.total,
    prescreen_income_score: prescreen.income,
    prescreen_employment_score: prescreen.employment,
    prescreen_refs_score: prescreen.references,
    prescreen_affordability_flag: prescreen.affordability_flag,
  }).eq("id", id)

  // Fetch org for branding
  const { data: org } = await service
    .from("organisations")
    .select("name, email, phone, address_line1, city, brand_logo_url, brand_accent_color, reply_to_email")
    .eq("id", app.org_id as string)
    .single()

  // Fetch agent email
  const { data: agentRow } = await service
    .from("user_orgs")
    .select("user_id, user_profiles(email)")
    .eq("org_id", app.org_id as string)
    .eq("role", "agent")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()

  const agentEmail = (agentRow?.user_profiles as unknown as { email: string } | null)?.email ?? null

  const branding = buildBranding(org, undefined)
  const orgContext = {
    orgId: app.org_id as string,
    orgName: org?.name ?? "Pleks",
    orgEmail: org?.email as string | undefined,
    orgPhone: org?.phone as string | undefined,
    agentEmail: agentEmail ?? undefined,
    branding,
  }
  const appSummary = {
    id,
    firstName: app.first_name as string,
    lastName: app.last_name as string,
    email: app.applicant_email as string,
    phone: app.applicant_phone as string | undefined,
    employerName: app.employer_name as string | undefined,
    employmentType: app.employment_type as string | undefined,
    grossMonthlyIncomeCents: app.gross_monthly_income_cents as number | undefined,
    prescreenScore: prescreen.total,
    prescreenTotal: 45,
    rentToIncomePct: prescreen.rent_to_income_pct,
    documentsComplete: true,
    bankStatementAvgIncomeCents: (bankData?.avg_monthly_income_cents as number | null) ?? null,
    bankStatementBounced: (bankData?.bounced_debits as number | null) ?? null,
  }
  const listingSummary = {
    id: listing?.id as string ?? "",
    unitLabel: unit?.unit_number as string ?? "",
    propertyName: property?.name as string ?? "",
    city: property?.city as string | undefined,
    askingRentCents: listing?.asking_rent_cents as number ?? 0,
    availableFrom: listing?.available_from as string | undefined,
  }

  // Send emails (non-blocking)
  void sendApplicationReceived(appSummary, listingSummary, orgContext, {
    slug: listing?.public_slug as string ?? "",
    accessToken: body.token,
  })

  if (agentEmail) {
    const applicationsCount = ((listing?.applications_count as number) ?? 0) + 1
    void sendAgentApplicationNotification(appSummary, listingSummary, orgContext, { applicationsCount })
  }

  // Increment listing applications_count
  if (listing?.id) {
    try {
      await service.rpc("increment_listing_applications", { listing_id: listing.id as string })
    } catch { /* ignore if RPC doesn't exist yet */ }
  }

  return NextResponse.json({ ok: true })
}
