/**
 * app/api/webhooks/payfast/application/route.ts — PayFast ITN handler for application fee payments
 *
 * Route:  POST /api/webhooks/payfast/application
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   applications table — updates fee_status, triggers screening
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendPaymentReceived } from "@/lib/applications/emails"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  if (params.payment_status !== "COMPLETE") {
    return NextResponse.json({ ok: true })
  }

  const { valid, error } = await validatePayFastITN(params, rawBody)
  if (!valid) {
    console.error("PayFast application ITN validation failed:", error)
    return NextResponse.json({ error }, { status: 400 })
  }

  const applicationId = params.custom_str1
  if (!applicationId) {
    return NextResponse.json({ error: "Missing application_id" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()

    // Update application: fee paid, trigger screening
    await supabase.from("applications").update({
      fee_status: "paid",
      fee_paid_at: new Date().toISOString(),
      payfast_payment_id: params.pf_payment_id || params.m_payment_id,
      stage2_status: "payment_received",
    }).eq("id", applicationId)

    // Mark screening in progress
    await supabase.from("applications").update({
      stage2_status: "screening_in_progress",
      searchworx_check_status: "pending",
    }).eq("id", applicationId)

    // Send Email 6: Payment received
    try {
      const ctx = await buildEmailContext(applicationId)
      if (ctx) await sendPaymentReceived(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {
        paymentRef: params.pf_payment_id || params.m_payment_id || "",
        slug: ctx.listingSlug ?? "",
        accessToken: ctx.accessToken ?? "",
        amountCents: Math.round(Number.parseFloat(params.amount_gross || "0") * 100),
        paidAt: new Date().toISOString(),
      })
    } catch (e) { console.error("sendPaymentReceived failed:", e) }

    // Audit log
    const { data: app } = await supabase
      .from("applications")
      .select("org_id")
      .eq("id", applicationId)
      .single()

    if (app) {
      await supabase.from("audit_log").insert({
        org_id: app.org_id,
        table_name: "applications",
        record_id: applicationId,
        action: "UPDATE",
        new_values: {
          fee_status: "paid",
          stage2_status: "screening_in_progress",
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { webhook_type: "payfast_application" },
      extra: { application_id: applicationId },
    })
    console.error("[payfast/application] unhandled error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
