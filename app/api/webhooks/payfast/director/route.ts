/**
 * app/api/webhooks/payfast/director/route.ts — PayFast ITN handler for a co party's own screening line
 *
 * Route:  POST /api/webhooks/payfast/director
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   the party's application_screening_payments row (marked paid in place, lib/screening/lineFee.ts),
 *         application_co_applicants (existence + consent read); audit_log on every payment and every refusal
 * Notes:  ADDENDUM_14W §0: every co party — surety, co-applicant, guarantor — pays their own line here (the name is
 *         historical). custom_str2 = coApplicantId, custom_str4 = the INTENDED fee, kept for divergence forensics only.
 *         Cross-checks amount_gross against the line's SERVER-SIDE stamp — the row the payment page stamped before it
 *         signed the form — and marks THAT row paid. It never writes fee_cents: the stamp is the quoted fee and the
 *         immutability trigger refuses a change, so an overpayment is recorded in the audit row beside it.
 *         Idempotent on the row's paid_at, so a PayFast retry cannot re-arm a paid line.
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"
import { markLinePaid, readLine } from "@/lib/screening/lineFee"

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

    /** Durable record of a payment we are NOT accepting (or accept with a defect). Sentry + console + audit; PII-free. */
    const flagMismatch = async (reason: string, expectedCents: number | null, rowId: string | null = null, table = "application_screening_payments") => {
      console.error("[payfast/director] fee MISMATCH " + JSON.stringify({
        applicationId, coApplicantId, expectedCents, intendedFeeCents, paidCents, reason, transactionId,
      }))
      Sentry.captureMessage("PayFast director fee mismatch", {
        level: "error",
        tags: { route: "webhooks/payfast/director", reason },
        extra: { applicationId, coApplicantId, expectedCents, intendedFeeCents, paidCents, transactionId },
      })
      // orgId here is custom_str3 — gateway-round-tripped, but the co row was matched on it before any audit is
      // written (rowId is only passed once that read succeeded), so the row is never filed under a foreign org.
      if (rowId) {
        await recordAudit(service, {
          orgId, table, recordId: rowId, action: "UPDATE",
          after: { fee_payment_flag: reason, expected_fee_cents: expectedCents, paid_cents: paidCents, payfast_transaction_id: transactionId },
        }).catch((e) => console.error("director mismatch audit write failed:", e))
      }
    }

    const { data: coApp, error: coAppError } = await service
      .from("application_co_applicants")
      .select("id, stage2_consent_given_at")
      .eq("id", coApplicantId)
      .eq("primary_application_id", applicationId)
      .eq("org_id", orgId)
      .maybeSingle()
    logQueryError("POST application_co_applicants line lookup", coAppError)

    if (coAppError) {
      // FAIL CLOSED — we cannot verify, so we do not accept.
      await flagMismatch("co_applicant_lookup_failed", null)
      return NextResponse.json({ ok: false, reason: "fee_lookup_failed" }, { status: 503 })
    }
    if (!coApp) {
      // maybeSingle() returns {data:null,error:null} for ZERO rows. Without this a payment would be accepted against a
      // co party that does not exist on this application in this org.
      await flagMismatch("co_applicant_not_found", null)
      return NextResponse.json({ ok: false, reason: "co_applicant_not_found" })
    }

    // The SERVER-SIDE expected fee is the line's own stamp (14W §0) — the row the payment page stamped before it signed
    // the form. custom_str4 is our own intent round-tripped through the gateway, so it cannot verify itself.
    const lineRef = { orgId, applicationId, subjectType: "co_applicant" as const, subjectId: coApplicantId }
    const line = await readLine(service, lineRef)
    if (!line.ok) {
      await flagMismatch("idempotency_lookup_failed", null)
      return NextResponse.json({ ok: false, reason: "idempotency_lookup_failed" }, { status: 503 })
    }
    if (line.row?.paid_at) {
      console.warn("[payfast/director] duplicate ITN ignored " + JSON.stringify({ applicationId, coApplicantId, transactionId }))
      return NextResponse.json({ ok: true, duplicate: true })
    }
    if (!line.row?.pricing_policy_version) {
      // Never a literal fallback: a payment against an unstamped line cannot be checked, so it is not accepted.
      // With no line row at all, the audit row is filed against the co row matched above, so the money PayFast took is
      // still visible to reconciliation (walker 14w-s0a F5).
      if (line.row) await flagMismatch("no_quoted_fee", null, line.row.id)
      else await flagMismatch("no_quoted_fee", null, coApp.id as string, "application_co_applicants")
      return NextResponse.json({ ok: false, reason: "no_quoted_fee" })
    }
    const expectedCents = line.row.fee_cents
    const rowId = line.row.id

    if (paidCents === null) {
      await flagMismatch("unparseable_amount_gross", expectedCents, rowId)
      return NextResponse.json({ ok: false, reason: "unparseable_amount" })
    }
    if (paidCents < expectedCents) {
      // UNDERPAID — the line stays unpaid, so it never reaches ready_to_run and no bureau call is made.
      // 200 so PayFast stops retrying; the audit row + Sentry are the signal for a human.
      await flagMismatch("underpaid", expectedCents, rowId)
      return NextResponse.json({ ok: false, reason: "amount_mismatch_underpaid" })
    }
    if (paidCents > expectedCents) {
      // OVERPAID — proceed. The party has paid; the overpayment lives in the audit rows, the line keeps its stamp.
      await flagMismatch("overpaid", expectedCents, rowId)
    }

    const marked = await markLinePaid(service, { ...lineRef, rowId }, {
      paidAt: now, paidByEmail: params.email_address ?? null, transactionId,
    })
    if (!marked.ok) {
      // Verified money, unrecorded. 503 so PayFast retries — the retry finds the line unpaid and tries again.
      await flagMismatch("line_mark_failed", expectedCents, rowId)
      return NextResponse.json({ ok: false, reason: "line_mark_failed" }, { status: 503 })
    }
    if (marked.marked === 0) {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    // CONSENT BELT. The payment page builds no form before this party's consent, so a paid line without it is an
    // anomaly. The money is recorded; nothing runs — the line-runner takes only ready_to_run lines, which need consent.
    if (!coApp.stage2_consent_given_at) await flagMismatch("paid_pending_consent", expectedCents, rowId)

    // Audit log — record_id is the payment row, not the co-applicant
    await recordAudit(service, {
      orgId, table: "application_screening_payments", recordId: rowId, action: "UPDATE",
      after: {
        paid_at: now, payfast_transaction_id: transactionId,
        paid_cents: paidCents,              // what PayFast took
        expected_fee_cents: expectedCents,  // the line's stamp it was checked against
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
