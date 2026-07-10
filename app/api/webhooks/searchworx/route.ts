/**
 * app/api/webhooks/searchworx/route.ts — Searchworx credit-check result callback
 *
 * Route:  POST /api/webhooks/searchworx
 * Auth:   shared-secret header (x-searchworx-secret) constant-time-compared to SEARCHWORX_WEBHOOK_SECRET.
 *         INERT until that env is set — returns 503 so no forged payload can write while Searchworx is unwired.
 * Data:   applications — stores searchworx payload, advances screening status.
 *         FitScore v1 computed by fitScoreOrchestrator (Phase C). Email 7 sent there too.
 */
import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { sendCreditReportToApplicant } from "@/lib/screening/sendCreditReport"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { optionalEnv } from "@/lib/env"

export const runtime = "nodejs"

function secretMatches(provided: string | null, secret: string): boolean {
  if (!provided) return false
  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(secret)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  // Webhook auth (webhooks bypass proxy gates → the route MUST verify itself). Shared-secret header, constant-time
  // compared — INERT until SEARCHWORX_WEBHOOK_SECRET is set: returns 503 so no forged payload can write while
  // Searchworx isn't wired. Same posture as the DocuSeal webhook. Was: NO verification at all — any POST with a
  // known application id could overwrite searchworx_extracted_data with an arbitrary payload, flip stage2_status
  // to "screening_complete", and email a forged credit report to the applicant. (When Searchworx creds land, swap
  // the header/compare for their real signature scheme; the 503-when-unset keeps it safe until then.)
  const secret = optionalEnv("SEARCHWORX_WEBHOOK_SECRET")
  if (!secret) {
    return NextResponse.json({ error: "Not yet active" }, { status: 503 })
  }
  if (!secretMatches(req.headers.get("x-searchworx-secret"), secret)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 })
  }

  const body = await req.json()

  const applicationId = body.reference
  if (!applicationId) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id, org_id")
    .eq("id", applicationId)
    .single()
    logQueryError("POST applications", applicationError)

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  try {
    await supabase.from("applications").update({
      searchworx_check_id: body.check_reference || body.id,
      searchworx_extracted_data: body,
      searchworx_check_status: "complete",
      searchworx_checked_at: new Date().toISOString(),
      stage2_status: "screening_complete",
    }).eq("id", applicationId)

    await supabase.from("audit_log").insert({
      org_id: application.org_id,
      table_name: "applications",
      record_id: applicationId,
      action: "UPDATE",
      new_values: { searchworx_check_status: "complete" },
    })

    // Send credit report to applicant (independent of FitScore)
    await sendCreditReportToApplicant(applicationId)

    // FitScore v1 + Email 7 triggered by fitScoreOrchestrator (Phase C)

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { webhook_type: "searchworx" },
      extra: { application_id: applicationId },
    })
    console.error("[searchworx webhook] processing failed:", err)
    await supabase.from("applications").update({
      searchworx_check_status: "failed",
    }).eq("id", applicationId)
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
