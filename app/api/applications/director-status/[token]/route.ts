/**
 * app/api/applications/director-status/[token]/route.ts — Director screening status data endpoint
 *
 * Route:  GET /api/applications/director-status/[token]
 * Auth:   application_co_applicants.access_token lookup (service client — no anon RLS needed)
 * Data:   application_co_applicants, application_screening_payments
 * Notes:  Used by the director status page (client component) to poll for progress.
 *         Returns only the safe display fields for this director's own row.
 *         POPIA boundary: no cross-director data, no screening result details.
 *         Replaces a direct anon Supabase client query that was blocked by RLS
 *         (application_co_applicants has no anon SELECT policy by design).
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: coApp, error: coErr } = await service
    .from("application_co_applicants")
    .select("id, first_name, primary_application_id, stage2_consent_given_at, searchworx_check_status, access_token_expires, declined_at")
    .eq("access_token", token)
    .is("declined_at", null)
    .single()

  if (coErr || !coApp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (coApp.access_token_expires && new Date(coApp.access_token_expires) < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 410 })
  }

  const { data: payment, error: paymentError } = await service
    .from("application_screening_payments")
    .select("paid_at")
    .eq("application_id", coApp.primary_application_id)
    .eq("subject_type", "co_applicant")
    .eq("subject_id", coApp.id)
    .maybeSingle()
    logQueryError("GET application_screening_payments", paymentError)

  return NextResponse.json({
    firstName:      coApp.first_name,
    consentGiven:   !!coApp.stage2_consent_given_at,
    paymentPaid:    !!payment?.paid_at,
    checksComplete: coApp.searchworx_check_status === "complete",
    checkStatus:    coApp.searchworx_check_status ?? "not_run",
  })
}
