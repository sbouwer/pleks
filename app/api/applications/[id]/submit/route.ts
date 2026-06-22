/**
 * POST /api/applications/[id]/submit — run the Step-1 FREE ASSESSMENT (zero-AI).
 *
 * Records POPIA Stage-1 consent (scope covers the Step-2 AI document analysis) + computes the COMBINED declared
 * affordability + readiness over ALL applicants (primary + co-applicants; guarantors excluded from affordability)
 * and stores it on the application (applications.free_assessment). NO AI, NO deep scan — the deep scan moved to
 * shortlist (Step 2). Does NOT set submitted_at; the applicant reviews the free assessment, then submits via
 * /submit-to-agent. (ADDENDUM_14M three-step funnel, P1e — supersedes the eager-extraction-at-submit posture.)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { freeAssessment, type FreeApplicantInput } from "@/lib/applications/freeAssessment"
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

  // Build the applicant set (primary + co-applicants) for the combined declared assessment. Guarantors/sureties
  // are included so readiness reflects them, but freeAssessment excludes their income from combined affordability.
  const rentCents = (listing?.asking_rent_cents as number) ?? 0
  const { data: coRows, error: coErr } = await service.from("application_co_applicants")
    .select("role, is_surety_director, gross_monthly_income_cents, id_type, id_number, stage1_consent_given")
    .eq("primary_application_id", id)
  logQueryError("submit co-applicants", coErr)

  const applicants: FreeApplicantInput[] = [
    { role: "primary", declaredIncomeCents: (app.gross_monthly_income_cents as number | null) ?? 0, idType: app.id_type as string | null, idNumber: app.id_number as string | null, complete: true },
    ...(coRows ?? []).map((c): FreeApplicantInput => ({
      role: c.role === "guarantor" || c.is_surety_director === true ? "guarantor" : "co_applicant",
      declaredIncomeCents: (c.gross_monthly_income_cents as number | null) ?? 0,
      idType: c.id_type as string | null, idNumber: c.id_number as string | null,
      complete: c.stage1_consent_given === true,
    })),
  ]
  const assessment = freeAssessment(rentCents, applicants)

  const now = new Date().toISOString()
  // Store the free assessment + record Stage-1 consent. NO deep scan — it runs at shortlist (Step 2).
  const { error: updErr } = await service.from("applications").update({
    stage1_status: "pre_screen_complete",
    stage1_consent_given: true,
    stage1_consent_given_at: now,
    stage1_consent_ip: body.consentIp ?? null,
    free_assessment: { ...assessment, assessedAt: now },
  }).eq("id", id)
  logQueryError("submit free_assessment update", updErr)

  // POPIA: record consent — scope covers the Step-2 AI document analysis (P1h), so the deep scan at shortlist
  // is consented now (no gap when it turns on).
  await service.from("consent_log").insert({
    org_id: app.org_id as string,
    subject_email: (tokenRow.applicant_email as string | null) ?? (app.applicant_email as string),
    consent_type: "popia_application", consent_given: true,
    ip_address: body.consentIp ?? null,
    metadata: { application_id: id, scope: "stage1_prescreen_and_ai_document_analysis" },
  })

  return NextResponse.json({ ok: true, freeAssessment: assessment })
}
