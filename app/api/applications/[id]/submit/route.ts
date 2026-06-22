/**
 * POST /api/applications/[id]/submit — run the PRE-SCREEN (not the final submission).
 *
 * 1. Records POPIA Stage-1 PROCESSING consent (needed to read documents) — NOT a submission to the agent.
 * 2. Calculates the pre-screen score + kicks off the 14L/14M screening pipeline.
 * Does NOT set submitted_at and does NOT email the agent — the applicant reviews the score and then explicitly
 * submits via /submit-to-agent (which sets submitted_at + sends the notifications). Agent visibility, dedup and
 * retention key off submitted_at, so viewing the pre-screen never counts as applying.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { calculatePrescreen } from "@/lib/applications/prescreen"
import { MAX_SCREENING_ITERATIONS } from "@/lib/constants"
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

  // NOTE: the applicant/agent submission emails are NOT sent here — this route only runs the pre-screen. They
  // fire from /submit-to-agent (sendSubmissionNotifications) when the applicant reviews the score and explicitly
  // submits, so the agent isn't notified before there's a real submission.

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
