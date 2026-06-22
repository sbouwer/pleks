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
import { MAX_SCREENING_ITERATIONS } from "@/lib/constants"
import { sendApplicationReceived, sendAgentApplicationNotification } from "@/lib/applications/emails"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { getUserEmail } from "@/lib/auth/userEmail"
import { getServerUser } from "@/lib/auth/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

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
  const { data: tokenRow, error: tokenRowError } = await service
    .from("application_tokens")
    .select("application_id, applicant_email")
    .eq("token", body.token)
    .eq("application_id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
    logQueryError("POST application_tokens", tokenRowError)

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }

  // Fetch application + listing
  const { data: app, error: appError } = await service
    .from("applications")
    .select("*, listings(id, public_slug, asking_rent_cents, applications_count, status, closes_at, units(unit_number, properties(id, name, city, managing_agent_id)), org_id)")
    .eq("id", id)
    .single()
    logQueryError("POST applications", appError)

  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const listing = app.listings as Record<string, unknown> | null
  const unit = listing?.units as Record<string, unknown> | null
  const property = unit?.properties as Record<string, unknown> | null

  // Retention race guard: once a listing has closed (status flipped by the expire-listings cron, or closes_at
  // has simply passed), refuse new submissions — so a submit can't land while the cron is purging that listing's
  // unsubmitted drafts. Saved drafts on a closed listing are deleted; they cannot be converted to submissions.
  const listingClosesAt = listing?.closes_at as string | null
  if (listing?.status === "expired" || (listingClosesAt && new Date(listingClosesAt) <= new Date())) {
    return NextResponse.json({ error: "This listing has closed and is no longer accepting applications." }, { status: 410 })
  }

  // Anti-bot gate: the applicant must have verified their email (OTP) before submit — UNLESS they're the
  // logged-in owner of that email (a Supabase account's email is already confirmed, so no second check needed).
  if (!app.email_verified_at) {
    const sessionEmail = (await getServerUser())?.email ?? null
    const ownerLoggedIn = !!sessionEmail && !!app.applicant_email && sessionEmail.toLowerCase() === (app.applicant_email as string).toLowerCase()
    if (!ownerLoggedIn) {
      return NextResponse.json({ error: "Please verify your email before submitting.", code: "email_unverified" }, { status: 403 })
    }
  }

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
    stage1_status: "screening",
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
  const { data: org, error: orgError } = await service
    .from("organisations")
    .select("name, email, phone, brand_accent_color")
    .eq("id", app.org_id as string)
    .single()
    logQueryError("POST organisations", orgError)

  // Fetch agent email
  const { data: agentRow, error: agentRowError } = await service
    .from("user_orgs")
    .select("user_id")
    .eq("org_id", app.org_id as string)
    .eq("role", "agent")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()
    logQueryError("POST user_orgs", agentRowError)

  const agentEmail = await getUserEmail(service, agentRow?.user_id as string | null)

  const branding = buildBranding(await fetchOrgSettings(app.org_id as string))
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
    // Derive the live count (count(*) where listing_id) — no stored counter or rpc to drift (PR-4:
    // increment_listing_applications never existed, so the counter never moved). Includes the
    // application just inserted above.
    const { count, error: countErr } = await service
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", listing?.id as string ?? "")
    if (countErr) console.error("submit applications count:", countErr.message)
    void sendAgentApplicationNotification(appSummary, listingSummary, orgContext, { applicationsCount: count ?? 0 })
  }

  // POPIA: record financial-screening consent as a consent_log row BEFORE any document processing.
  await service.from("consent_log").insert({
    org_id: app.org_id as string,
    subject_email: (tokenRow.applicant_email as string | null) ?? (app.applicant_email as string),
    consent_type: "popia_application", consent_given: true,
    ip_address: body.consentIp ?? null,
    metadata: { application_id: id, scope: "stage1_financial_screening" },
  })

  // ONE-ADJUSTMENT CAP: the initial pre-screen + exactly one re-check (MAX_SCREENING_ITERATIONS). Don't kick
  // off another pass once the cap is reached — caps Sonnet cost + gaming; the agent reviews from there.
  const { count: evalCount, error: evalCountErr } = await service
    .from("application_screening_evaluations")
    .select("id", { count: "exact", head: true })
    .eq("application_id", id)
  logQueryError("submit screening eval count", evalCountErr)
  const capReached = (evalCount ?? 0) >= MAX_SCREENING_ITERATIONS

  if (!capReached) {
    // Kick off the durable async pre-screen (14L pipeline → 14M ruling): insert a job + fire the screen route.
    // The fire is awaited briefly so it flushes; the screening-jobs cron is the real reliability path if this
    // invocation dies before the connection lands.
    await service.from("screening_jobs").insert({ org_id: app.org_id as string, application_id: id, status: "pending" })
    try {
      await fetch(`${req.nextUrl.origin}/api/applications/${id}/screen`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: body.token }), signal: AbortSignal.timeout(2500),
      })
    } catch { /* best-effort dispatch; cron retries the pending job if this didn't land */ }
  }

  return NextResponse.json({
    ok: true,
    capReached,
    prescreen: {
      score: prescreen.total,
      affordabilityFlag: prescreen.affordability_flag,
      rentToIncomePct: prescreen.rent_to_income_pct,
    },
  })
}
