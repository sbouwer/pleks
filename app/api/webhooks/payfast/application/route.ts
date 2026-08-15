/**
 * app/api/webhooks/payfast/application/route.ts — PayFast ITN handler for application fee payments
 *
 * Route:  POST /api/webhooks/payfast/application
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   applications (fee_status, screening trigger) + audit_log on any rejected/mismatched payment
 * Notes:  Cross-checks amount_gross against the recorded fee. Fails CLOSED on a lookup error (503) or a
 *         missing application row; ignores a duplicate delivery once fee_status is paid, so a PayFast
 *         retry cannot re-arm a completed screening and bill Searchworx twice.
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
      .from("applications").select("org_id, fee_amount_cents, fee_status").eq("id", applicationId).maybeSingle()
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
      // The money exists at PayFast even though we refuse it here — an audit row is what makes it visible
      // to reconciliation. It needs an org_id, which we only have when the application row was READ. When
      // the row is missing or the lookup failed there is no org to scope an audit row to, so Sentry above
      // is the only durable trace for those two paths. Stated plainly rather than claimed otherwise.
      if (expectedRow?.org_id) {
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

    if (!expectedRow) {
      // FAIL CLOSED on a MISSING row. maybeSingle() returns {data:null,error:null} for zero rows, so this
      // does NOT reach the branch above — and with expectedCents null the amount check would be skipped
      // entirely, the two .update()s would touch 0 rows, buildEmailContext would return null, and the
      // trailing audit would be skipped. A real R250 would vanish with no record anywhere. Refuse instead.
      await flagMismatch("application_not_found")
      return NextResponse.json({ ok: false, reason: "application_not_found" })
    }

    if (paidCents === null) {
      await flagMismatch("unparseable_amount_gross")
      return NextResponse.json({ ok: false, reason: "unparseable_amount" })
    }

    // IDEMPOTENCY. PayFast retries, and this handler re-arms screening (searchworx_check_status → pending)
    // unconditionally. A duplicate delivery after a completed screening would flip it back to pending, the
    // screening-line-runner cron would re-claim it, and Pleks would pay Searchworx for the bundle a SECOND
    // time — plus send a second receipt. The sibling director handler already guards this; this one did not.
    if (expectedRow.fee_status === "paid") {
      console.warn("[payfast] duplicate application ITN ignored " + JSON.stringify({
        applicationId, pf_payment_id: params.pf_payment_id ?? null,
      }))
      return NextResponse.json({ ok: true, duplicate: true })
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

    // JURISTIC: one payment covers the entity AND every surety party (Stéan ruling 2026-08-15), so write
    // ONE application_screening_payments row per screened subject here rather than leaving each director
    // or trustee to pay their own. Their line is now paid on arrival — they still have to CONSENT
    // individually (D-14B-01, no proxy consent), which is what their portal is for. This is also what
    // makes the director-reminder copy ("X has already paid for your portion") true.
    const { data: sureties, error: suretyError } = await supabase
      .from("application_co_applicants")
      .select("id")
      .eq("primary_application_id", applicationId)
      .eq("is_surety_director", true)
      .is("declined_at", null)
    logQueryError("POST application_co_applicants surety lines", suretyError)

    if (!suretyError && sureties && sureties.length > 0) {
      const perLineCents = Math.round(paidCents / (sureties.length + 1)) // entity line + one per surety
      const lines = [
        { subject_type: "company" as const, subject_id: applicationId },
        ...sureties.map((s) => ({ subject_type: "co_applicant" as const, subject_id: s.id as string })),
      ].map((l) => ({
        org_id: expectedRow.org_id,
        application_id: applicationId,
        subject_type: l.subject_type,
        subject_id: l.subject_id,
        fee_cents: perLineCents,
        paid_at: new Date().toISOString(),
        paid_by_email: params.email_address ?? null,
        payfast_transaction_id: params.pf_payment_id || params.m_payment_id,
      }))

      const { error: linesError } = await supabase
        .from("application_screening_payments")
        .upsert(lines, { onConflict: "application_id,subject_type,subject_id" })
      if (linesError) {
        // Do NOT fail the ITN — the money is taken and the application is marked paid. A missing line
        // blocks that subject's screening, which is visible on the co-parties roster, so surface it loudly.
        console.error("[payfast] surety line write failed:", linesError.message)
        Sentry.captureMessage("PayFast juristic surety lines not written", {
          level: "error",
          tags: { route: "webhooks/payfast/application" },
          extra: { applicationId, lineCount: lines.length, error: linesError.message },
        })
      }
    }

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
