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
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

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

    // AMOUNT CROSS-CHECK. The ITN signature proves PayFast sent this, NOT that the amount matches what
    // we meant to charge. Until 2026-08-14 buildApplicationFeeForm hardcoded "399.00" while the route
    // wrote R250 to fee_amount_cents — the two diverged for three months and nothing noticed, because
    // this handler marked the fee paid on trust. Compare what was actually paid against what we recorded.
    const rawGross = params.amount_gross
    const parsedGross = Number.parseFloat(rawGross ?? "")
    // A missing/garbage amount_gross must NOT be treated as 0 (which reads as underpaid) or as NaN
    // (which slips past `<` into the overpaid branch and puts NaN on the applicant's receipt).
    const paidCents = Number.isFinite(parsedGross) ? Math.round(parsedGross * 100) : null

    const { data: expectedRow, error: expectedError } = await supabase
      .from("applications").select("org_id, fee_amount_cents").eq("id", applicationId).maybeSingle()
    logQueryError("POST applications fee cross-check", expectedError)
    const expectedCents = expectedRow?.fee_amount_cents ?? null

    /** Durable record of a payment we are NOT accepting — log, audit row, Sentry. Never silent. */
    const flagMismatch = async (reason: string) => {
      // PII-free: ids and amounts only.
      console.error("[payfast] application fee MISMATCH " + JSON.stringify({
        applicationId, expectedCents, paidCents, rawGross: rawGross ?? null, reason,
        pf_payment_id: params.pf_payment_id ?? null,
      }))
      Sentry.captureMessage("PayFast application fee mismatch", {
        level: "error",
        tags: { route: "webhooks/payfast/application", reason },
        extra: { applicationId, expectedCents, paidCents, rawGross: rawGross ?? null, pfPaymentId: params.pf_payment_id ?? null },
      })
      if (expectedRow?.org_id) {
        // The money exists at PayFast even though we refuse it here — an audit row is the only thing
        // that makes it visible to reconciliation. Without it the payment is invisible everywhere.
        await recordAudit(supabase, {
          orgId: expectedRow.org_id, table: "applications", recordId: applicationId, action: "UPDATE",
          after: { fee_payment_rejected: reason, expected_fee_cents: expectedCents, paid_cents: paidCents, payfast_payment_id: params.pf_payment_id ?? null },
        }).catch((e) => console.error("mismatch audit write failed:", e))
      }
    }

    if (expectedError) {
      // FAIL CLOSED. Previously a transient lookup failure silently disabled the money control for this
      // ITN. We cannot verify the amount, so we do not accept it — and we leave a durable trace.
      await flagMismatch("expected_fee_lookup_failed")
      return NextResponse.json({ ok: false, reason: "fee_lookup_failed" }, { status: 503 })
    }

    if (paidCents === null) {
      await flagMismatch("unparseable_amount_gross")
      return NextResponse.json({ ok: false, reason: "unparseable_amount" })
    }

    if (expectedCents !== null && paidCents !== expectedCents) {
      if (paidCents < expectedCents) {
        // UNDERPAID — do not mark paid and do not start screening; screening costs real money per head.
        // 200 (not 4xx) so PayFast stops retrying: a retry cannot fix an underpayment. The audit row +
        // Sentry event raised above are what make this visible; the console line alone is not a signal.
        await flagMismatch("underpaid")
        return NextResponse.json({ ok: false, reason: "amount_mismatch_underpaid" })
      }
      // OVERPAID — proceed. The applicant has paid; stranding them punishes the wrong party.
      await flagMismatch("overpaid")
    }

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
        amountCents: paidCents,
        paidAt: new Date().toISOString(),
      })
    } catch (e) { console.error("sendPaymentReceived failed:", e) }

    // Audit log
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("org_id")
      .eq("id", applicationId)
      .single()
    logQueryError("POST applications", appError)

    if (app) {
      await recordAudit(supabase, { orgId: app.org_id, table: "applications", recordId: applicationId, action: "UPDATE", after: {
          fee_status: "paid",
          stage2_status: "screening_in_progress",
        } })
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
