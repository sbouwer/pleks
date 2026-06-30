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
import { notifyAllSubmitted } from "@/lib/applications/peerEmails"
import { incompleteApplicantCount } from "@/lib/applications/submitGate"
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
  // Credential boundary (14R §4): ANY peer may submit. Accept the lead's application_tokens token OR a co's access
  // token — either bound to THIS application. The all-green gate below is what actually permits the submission.
  const { data: leadTok, error: tokenErr } = await service
    .from("application_tokens").select("application_id")
    .eq("token", body.token).eq("application_id", id).gt("expires_at", new Date().toISOString()).maybeSingle()
  logQueryError("submit-to-agent token", tokenErr)
  let authed = !!leadTok
  if (!authed) {
    const { data: coTok, error: coTokErr } = await service
      .from("application_co_applicants").select("id")
      .eq("access_token", body.token).eq("primary_application_id", id).is("declined_at", null).maybeSingle()
    logQueryError("submit-to-agent co token", coTokErr)
    authed = !!coTok
  }
  if (!authed) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

  const { data: app, error: appErr } = await service
    .from("applications")
    .select("submitted_at, stage1_consent_given, listings(status, closes_at)")
    .eq("id", id).single()
  logQueryError("submit-to-agent applications", appErr)
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Already submitted → idempotent no-op (e.g. a double-click).
  if (app.submitted_at) return NextResponse.json({ ok: true, alreadySubmitted: true })

  // ALL-GREEN GATE (14R §4 / J1): every peer must have finished their own section before ANYONE submits for the
  // group — one submission applies to all, so it can't go in half-complete. Full peers: the lead (the app row)
  // counts the same as every co. POPIA-safe — a count, not names (named "waiting on …" arrives with the Phase-4
  // roster). The lead's section sign-off is also the POPIA processing-consent record.
  const { data: coRows, error: coErr } = await service
    .from("application_co_applicants").select("stage1_consent_given").eq("primary_application_id", id)
  logQueryError("submit-to-agent co-applicants", coErr)
  const incompleteCount = incompleteApplicantCount(
    app.stage1_consent_given === true,
    (coRows ?? []).map((c) => c.stage1_consent_given === true),
  )
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

  // The submission notification carries a RESUME link for the LEAD applicant — always use the lead's token (a co
  // may have submitted with their own access token, which must never land in the lead's email).
  const { data: leadTokenRow, error: leadTokErr } = await service
    .from("application_tokens").select("token")
    .eq("application_id", id).gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("submit-to-agent lead token for notify", leadTokErr)
  // Joint app (14R): email ALL applicants "submitted + view-only link" via notifyAllSubmitted, and skip the lead's
  // legacy "received" (superseded). Solo app: the existing lead "received" + agent notification, unchanged.
  const isJoint = (coRows ?? []).length > 0
  await sendSubmissionNotifications(service, id, leadTokenRow?.token ?? body.token, { skipApplicant: isJoint })
  if (isJoint) void notifyAllSubmitted(service, id)

  return NextResponse.json({ ok: true })
}
