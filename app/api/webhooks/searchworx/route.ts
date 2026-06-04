/**
 * app/api/webhooks/searchworx/route.ts — Searchworx credit-check result callback
 *
 * Route:  POST /api/webhooks/searchworx
 * Auth:   Searchworx signature verification (pending API credentials)
 * Data:   applications — stores searchworx payload, advances screening status.
 *         FitScore v1 computed by fitScoreOrchestrator (Phase C). Email 7 sent there too.
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { sendCreditReportToApplicant } from "@/lib/screening/sendCreditReport"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: Request) {
  const body = await req.json()

  // Searchworx webhook signature verification — wire up once API credentials are configured

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
