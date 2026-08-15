/**
 * app/api/webhooks/payfast/director/route.ts — PayFast ITN handler for director screening fee payments
 *
 * Route:  POST /api/webhooks/payfast/director
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   application_screening_payments (upsert paid_at + the PAID amount), application_co_applicants
 * Notes:  Director fees are per-line (co-applicant row). Multiple directors on one application each get
 *         their own screening payment row. custom_str2 = coApplicantId, custom_str4 = the INTENDED fee.
 *         Idempotent: checks existing paid_at before upsert to prevent PayFast retry double-billing.
 *
 *         Cross-checks amount_gross against the co-applicant's SERVER-SIDE fee before accepting. It used
 *         to record custom_str4 — its own intent, round-tripped through the gateway — which made director
 *         payments structurally incapable of showing a charged-vs-paid divergence. fee_cents is now what
 *         PayFast says was taken; the intended figure is kept in the audit row beside it.
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"
import { APPLICATION_FEE_CENTS } from "@/lib/constants"

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
  const intendedFeeCents = Number.parseInt(params.custom_str4 ?? "0", 10)
  const transactionId    = params.pf_payment_id || params.m_payment_id || null

  if (!applicationId || !coApplicantId || !orgId) {
    return NextResponse.json({ error: "Missing required custom fields" }, { status: 400 })
  }

  try {
    const service = await createServiceClient()
    const now = new Date().toISOString()

    // What PayFast says was actually taken. Never 0-on-missing and never NaN — either would be compared
    // as if it were a real amount (0 reads as underpaid; NaN slips past `<` and is accepted).
    const parsedGross = Number.parseFloat(params.amount_gross ?? "")
    const paidCents = Number.isFinite(parsedGross) ? Math.round(parsedGross * 100) : null

    /** Durable record of a director payment we are NOT accepting. Sentry + console; PII-free. */
    const flagMismatch = (reason: string, expectedCents: number | null) => {
      console.error("[payfast/director] fee MISMATCH " + JSON.stringify({
        applicationId, coApplicantId, expectedCents, intendedFeeCents, paidCents, reason, transactionId,
      }))
      Sentry.captureMessage("PayFast director fee mismatch", {
        level: "error",
        tags: { route: "webhooks/payfast/director", reason },
        extra: { applicationId, coApplicantId, expectedCents, intendedFeeCents, paidCents, transactionId },
      })
    }

    // The SERVER-SIDE expected fee. custom_str4 is our own intent round-tripped through the gateway, so
    // it cannot verify itself — read the co-applicant row instead, the same source the payment page used.
    const { data: coApp, error: coAppError } = await service
      .from("application_co_applicants")
      .select("id, individual_fee_cents")
      .eq("id", coApplicantId)
      .eq("primary_application_id", applicationId)
      .maybeSingle()
    logQueryError("POST application_co_applicants fee cross-check", coAppError)

    if (coAppError) {
      // FAIL CLOSED — we cannot verify, so we do not accept.
      flagMismatch("co_applicant_lookup_failed", null)
      return NextResponse.json({ ok: false, reason: "fee_lookup_failed" }, { status: 503 })
    }
    if (!coApp) {
      // maybeSingle() returns {data:null,error:null} for ZERO rows, so this does not reach the branch
      // above. Without this the cross-check would be skipped and a payment accepted against a
      // co-applicant that does not exist on this application.
      flagMismatch("co_applicant_not_found", null)
      return NextResponse.json({ ok: false, reason: "co_applicant_not_found" })
    }
    if (paidCents === null) {
      flagMismatch("unparseable_amount_gross", coApp.individual_fee_cents ?? APPLICATION_FEE_CENTS)
      return NextResponse.json({ ok: false, reason: "unparseable_amount" })
    }

    const expectedCents = coApp.individual_fee_cents ?? APPLICATION_FEE_CENTS
    if (paidCents < expectedCents) {
      // UNDERPAID — no payment row, so the director's screening line never reaches ready_to_run and no
      // bureau call is made. 200 so PayFast stops retrying; Sentry above is the signal for a human.
      flagMismatch("underpaid", expectedCents)
      return NextResponse.json({ ok: false, reason: "amount_mismatch_underpaid" })
    }
    if (paidCents > expectedCents) {
      // OVERPAID — proceed and record what was actually taken. The director has paid.
      flagMismatch("overpaid", expectedCents)
    }

    // Idempotency: if already paid, skip — PayFast retries the same ITN on timeout
    const { data: existing, error: existingError } = await service
      .from("application_screening_payments")
      .select("id, paid_at")
      .eq("application_id", applicationId)
      .eq("subject_type", "co_applicant")
      .eq("subject_id", coApplicantId)
      .maybeSingle()
    logQueryError("POST application_screening_payments", existingError)

    if (existingError) {
      // FAIL CLOSED rather than risk a duplicate upsert that re-arms a paid line.
      flagMismatch("idempotency_lookup_failed", expectedCents)
      return NextResponse.json({ ok: false, reason: "idempotency_lookup_failed" }, { status: 503 })
    }

    if (existing?.paid_at) {
      console.warn("[payfast/director] duplicate ITN ignored " + JSON.stringify({ applicationId, coApplicantId, transactionId }))
      return NextResponse.json({ ok: true, duplicate: true })
    }

    // Upsert screening payment row for this director line
    const { data: payment, error: paymentErr } = await service
      .from("application_screening_payments")
      .upsert(
        {
          org_id:                orgId,
          application_id:        applicationId,
          subject_type:          "co_applicant",
          subject_id:            coApplicantId,
          // The PAID amount, not the intended one. Recording custom_str4 here meant this row could never
          // evidence a charged-vs-paid divergence — the intended figure is in the audit row below.
          fee_cents:             paidCents,
          paid_at:               now,
          payfast_transaction_id: transactionId,
        },
        { onConflict: "application_id,subject_type,subject_id" },
      )
      .select("id")
      .single()

    if (paymentErr || !payment) {
      console.error("[payfast/director] payment upsert failed:", paymentErr?.message)
      return NextResponse.json({ error: "Payment record failed" }, { status: 500 })
    }

    // Audit log — record_id is the payment row, not the co-applicant
    await recordAudit(service, {
      orgId, table: "application_screening_payments", recordId: payment.id, action: "UPDATE",
      after: {
        paid_at: now, payfast_transaction_id: transactionId,
        fee_cents: paidCents,               // what PayFast took
        expected_fee_cents: expectedCents,  // server-side truth it was checked against
        intended_fee_cents: intendedFeeCents, // what the form encoded — kept for divergence forensics
      },
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
