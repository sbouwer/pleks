/**
 * app/api/applications/[id]/submit-to-agent/route.ts — the REAL submission (applicant reviewed the pre-screen
 * and chose to send it to the agent).
 *
 * Route:  POST /api/applications/[id]/submit-to-agent
 * Auth:   application token (the capability) — public/unauthenticated applicant flow.
 * Data:   applications (set submitted_at), then fires the submission emails (lib/applications/submissionEmails).
 * Notes:  Distinct from /submit, which runs the Step-1 free assessment (consent + declared affordability +
 *         readiness) and does NOT mark the application submitted. Agent visibility, dedup and retention all key
 *         off submitted_at — so viewing the assessment never counts as submitting. Idempotent: a second call on
 *         an already-submitted row is a no-op. Gated by the J1 rule: all co-applicants must be complete first.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendSubmissionNotifications } from "@/lib/applications/submissionEmails"
import { logQueryError } from "@/lib/supabase/logQueryError"

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface Props { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { token?: string }
  const service = getServiceClient()

  if (!body.token) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  const { data: tokenRow, error: tokenErr } = await service
    .from("application_tokens").select("application_id")
    .eq("token", body.token).eq("application_id", id).gt("expires_at", new Date().toISOString()).maybeSingle()
  logQueryError("submit-to-agent token", tokenErr)
  if (!tokenRow) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

  const { data: app, error: appErr } = await service
    .from("applications")
    .select("submitted_at, stage1_consent_given, listings(status, closes_at)")
    .eq("id", id).single()
  logQueryError("submit-to-agent applications", appErr)
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Already submitted → idempotent no-op (e.g. a double-click).
  if (app.submitted_at) return NextResponse.json({ ok: true, alreadySubmitted: true })

  // Must have run the pre-screen first (POPIA processing consent recorded there).
  if (app.stage1_consent_given !== true) {
    return NextResponse.json({ error: "Run the pre-screen before submitting." }, { status: 400 })
  }

  // J1 SUBMIT GATE: every co-applicant/guarantor must have finished their part before anyone submits for the
  // group — one submission applies to all, so it can't go in half-complete. (ADDENDUM_14M joint applications)
  const { data: coRows, error: coErr } = await service
    .from("application_co_applicants").select("stage1_consent_given").eq("primary_application_id", id)
  logQueryError("submit-to-agent co-applicants", coErr)
  const incompleteCount = (coRows ?? []).filter((c) => c.stage1_consent_given !== true).length
  if (incompleteCount > 0) {
    return NextResponse.json({
      error: `Everyone on this application must finish their part before you submit — waiting on ${incompleteCount} ${incompleteCount === 1 ? "applicant" : "applicants"}.`,
      code: "applicants_incomplete", incompleteCount,
    }, { status: 409 })
  }

  // Can't submit to a listing that has closed (mirrors the /submit + retention race guard).
  const listing = app.listings as { status?: string; closes_at?: string | null } | null
  if (listing?.status === "expired" || (listing?.closes_at && new Date(listing.closes_at) <= new Date())) {
    return NextResponse.json({ error: "This listing has closed and is no longer accepting applications." }, { status: 410 })
  }

  const now = new Date().toISOString()
  const { error: updErr } = await service.from("applications").update({ submitted_at: now }).eq("id", id)
  logQueryError("submit-to-agent update", updErr)
  if (updErr) return NextResponse.json({ error: "Could not submit your application." }, { status: 500 })

  await sendSubmissionNotifications(service, id, body.token)

  return NextResponse.json({ ok: true })
}
