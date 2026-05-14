/**
 * app/api/webhooks/payfast/director/route.ts — PayFast ITN handler for director screening fee payments
 *
 * Route:  POST /api/webhooks/payfast/director
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   application_screening_payments (upsert paid_at), application_co_applicants (payfast_transaction_id)
 * Notes:  Director fees are per-line (co-applicant row). Multiple directors on one application
 *         each get their own screening payment row. custom_str2 = coApplicantId, custom_str4 = feeCents.
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  if (params.payment_status !== "COMPLETE") {
    return NextResponse.json({ ok: true })
  }

  const { valid, error } = await validatePayFastITN(params, rawBody)
  if (!valid) {
    console.error("PayFast director ITN validation failed:", error)
    return NextResponse.json({ error }, { status: 400 })
  }

  const applicationId  = params.custom_str1
  const coApplicantId  = params.custom_str2
  const orgId          = params.custom_str3
  const feeCents       = parseInt(params.custom_str4 ?? "0", 10)
  const transactionId  = params.pf_payment_id || params.m_payment_id || null

  if (!applicationId || !coApplicantId || !orgId) {
    return NextResponse.json({ error: "Missing required custom fields" }, { status: 400 })
  }

  try {
    const service = await createServiceClient()
    const now = new Date().toISOString()

    // Upsert screening payment row for this director line
    const { error: paymentErr } = await service
      .from("application_screening_payments")
      .upsert(
        {
          org_id:                orgId,
          application_id:        applicationId,
          subject_type:          "co_applicant",
          subject_id:            coApplicantId,
          fee_cents:             feeCents,
          paid_at:               now,
          payfast_transaction_id: transactionId,
        },
        { onConflict: "application_id,subject_type,subject_id" },
      )

    if (paymentErr) {
      console.error("[payfast/director] payment upsert failed:", paymentErr.message)
      return NextResponse.json({ error: "Payment record failed" }, { status: 500 })
    }

    // Audit log
    await service.from("audit_log").insert({
      org_id:     orgId,
      table_name: "application_screening_payments",
      record_id:  coApplicantId,
      action:     "UPDATE",
      new_values: { paid_at: now, payfast_transaction_id: transactionId, fee_cents: feeCents },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { webhook_type: "payfast_director" },
      extra: { application_id: applicationId, co_applicant_id: coApplicantId },
    })
    console.error("[payfast/director] unhandled error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
