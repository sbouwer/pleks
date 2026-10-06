/**
 * app/api/webhooks/payfast/application/route.ts — PayFast ITN handler for the lead's own screening line
 *
 * Route:  POST /api/webhooks/payfast/application
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   the lead line's application_screening_payments row (marked paid in place, lib/screening/lineFee.ts);
 *         applications (fee_status, stage2_status); audit_log on every rejected/mismatched payment
 * Notes:  ADDENDUM_14W §0: this payment is ONE line — the lead's own check, or a juristic application's company line —
 *         never a pooled amount split over parties. Cross-checks amount_gross against that line's stamped fee. Fails
 *         CLOSED on a lookup error (503) or a missing application/line; ignores a duplicate delivery once the line is
 *         paid, so a PayFast retry cannot re-arm a completed screening and bill Searchworx twice.
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendPaymentReceived } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"
import { leadLineSubjectType } from "@/lib/applications/juristicParties"
import { markLinePaid, readLine } from "@/lib/screening/lineFee"

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

    const { data: appRow, error: appError } = await supabase
      .from("applications")
      .select("org_id, fee_status, entity_type, applicant_type, company_info, stage2_consent_given_at, pricing_policy_version")
      .eq("id", applicationId)
      .maybeSingle()
    logQueryError("POST applications line lookup", appError)

    // The line's stamped fee, once the line is read. Null until then, and for a line nobody stamped.
    let expectedCents: number | null = null

    /** Durable record of a payment we are NOT accepting (or are accepting with a defect) — log, audit row, Sentry. */
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
      if (appRow?.org_id) {
        await recordAudit(supabase, {
          orgId: appRow.org_id, table: "applications", recordId: applicationId, action: "UPDATE",
          after: { fee_payment_rejected: reason, expected_fee_cents: expectedCents, paid_cents: paidCents, payfast_payment_id: params.pf_payment_id ?? null },
        }).catch((e) => console.error("mismatch audit write failed:", e))
      }
    }

    if (appError) {
      // FAIL CLOSED. Previously a transient lookup failure silently disabled the money control for this
      // ITN. We cannot verify the amount, so we do not accept it — and we leave a durable trace.
      await flagMismatch("expected_fee_lookup_failed")
      return NextResponse.json({ ok: false, reason: "fee_lookup_failed" }, { status: 503 })
    }

    if (!appRow) {
      // FAIL CLOSED on a MISSING row. maybeSingle() returns {data:null,error:null} for zero rows, so this
      // does NOT reach the branch above. A real payment would vanish with no record anywhere. Refuse instead.
      await flagMismatch("application_not_found")
      return NextResponse.json({ ok: false, reason: "application_not_found" })
    }

    const orgId = appRow.org_id as string
    const lineRef = { orgId, applicationId, subjectType: leadLineSubjectType(appRow), subjectId: applicationId }
    const line = await readLine(supabase, lineRef)
    if (!line.ok) {
      await flagMismatch("expected_fee_lookup_failed")
      return NextResponse.json({ ok: false, reason: "fee_lookup_failed" }, { status: 503 })
    }

    // IDEMPOTENCY. PayFast retries, and this handler re-arms screening (searchworx_check_status → pending). A duplicate
    // delivery after a completed screening would flip it back to pending and Pleks would pay Searchworx for the bundle
    // a SECOND time — plus send a second receipt. fee_status covers an application paid under the pooled form (§0
    // predecessor), whose line row may carry a split share rather than this form's stamp.
    if (appRow.fee_status === "paid" || line.row?.paid_at) {
      console.warn("[payfast] duplicate application ITN ignored " + JSON.stringify({
        applicationId, pf_payment_id: params.pf_payment_id ?? null,
      }))
      return NextResponse.json({ ok: true, duplicate: true })
    }

    if (paidCents === null) {
      await flagMismatch("unparseable_amount_gross")
      return NextResponse.json({ ok: false, reason: "unparseable_amount" })
    }

    if (!line.row?.pricing_policy_version) {
      // FAIL CLOSED on NO QUOTED FEE. The billing route stamps the line before it signs any form, so a payment with no
      // stamped line cannot be checked — including one made on a pooled form opened before §0, whose amount priced
      // other people's checks too. Not accepted; the audit row + Sentry make the money visible to reconciliation.
      await flagMismatch("no_quoted_fee")
      return NextResponse.json({ ok: false, reason: "no_quoted_fee" })
    }
    expectedCents = line.row.fee_cents

    if (paidCents !== expectedCents) {
      if (paidCents < expectedCents) {
        // UNDERPAID — do not mark paid and do not start screening; screening costs real money per head.
        // 200 (not 4xx) so PayFast stops retrying: a retry cannot fix an underpayment. The audit row +
        // Sentry event raised above are what make this visible; the console line alone is not a signal.
        await flagMismatch("underpaid")
        return NextResponse.json({ ok: false, reason: "amount_mismatch_underpaid" })
      }
      // OVERPAID — proceed. The applicant has paid; stranding them punishes the wrong party. The line keeps its quoted
      // fee (the immutability trigger refuses a change); what was actually taken is in the audit row this writes.
      await flagMismatch("overpaid")
    }

    const now = new Date().toISOString()
    const paymentRef = params.pf_payment_id || params.m_payment_id
    const marked = await markLinePaid(supabase, { ...lineRef, rowId: line.row.id }, {
      paidAt: now, paidByEmail: params.email_address ?? null, transactionId: paymentRef ?? null,
    })
    if (!marked.ok) {
      // The money is verified but unrecorded. 503 so PayFast retries — the retry finds the line unpaid and tries again.
      await flagMismatch("line_mark_failed")
      return NextResponse.json({ ok: false, reason: "line_mark_failed" }, { status: 503 })
    }
    if (marked.marked === 0) {
      // A concurrent delivery marked it between the read and this write — that one owns the side effects.
      return NextResponse.json({ ok: true, duplicate: true })
    }

    // CONSENT BELT. The billing route refuses a form until this line's consent is recorded, so a paid line without it
    // is an anomaly, not a flow. The money is recorded either way; nothing runs: the line-runner takes only
    // `ready_to_run` lines, which need consent, so this line waits as `paid_pending_consent` and is flagged.
    if (!appRow.stage2_consent_given_at) await flagMismatch("paid_pending_consent")

    const { error: statusError } = await supabase.from("applications").update({
      fee_status: "paid",
      fee_paid_at: now,
      // A DISPLAY copy of the lead line's quoted fee, written once with fee_paid_at. The line row stays the payment
      // record; this is what the applicant's status page and the stage-2 emails show. Only on an UNSTAMPED row:
      // application_fee_immutable refuses fee_amount_cents alone on a row carrying the pre-§0 pooled stamp, and that
      // refusal would fail the whole update and leave a paid line under an unpaid application (walker 14w-s0a F1).
      ...(appRow.pricing_policy_version ? {} : { fee_amount_cents: expectedCents }),
      payfast_payment_id: paymentRef,
      stage2_status: "screening_in_progress",
      searchworx_check_status: "pending",
    }).eq("id", applicationId).eq("org_id", orgId)
    // The line row above is the payment record and the runner's gate; the application status is the agent's view of
    // it. A failure here is surfaced, not retried — a retry would hit the duplicate guard on the line.
    if (statusError) {
      logQueryError("POST applications mark paid", statusError)
      Sentry.captureMessage("PayFast application status not updated after a paid line", {
        level: "error", tags: { route: "webhooks/payfast/application" }, extra: { applicationId, error: statusError.message },
      })
    }

    // Send Email 6: Payment received
    try {
      const ctx = await buildEmailContext(applicationId)
      if (ctx) await sendPaymentReceived(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {
        paymentRef: paymentRef || "",
        inviteToken: ctx.inviteToken,
        amountCents: paidCents,
        paidAt: now,
      })
    } catch (e) { console.error("sendPaymentReceived failed:", e) }

    await recordAudit(supabase, { orgId, table: "applications", recordId: applicationId, action: "UPDATE", after: {
      fee_status: "paid",
      stage2_status: "screening_in_progress",
      screening_line: lineRef.subjectType,
      paid_cents: paidCents,
    } })

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
