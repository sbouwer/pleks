/**
 * app/api/webhooks/payfast/application/route.ts — PayFast ITN handler for application fee payments
 *
 * Route:  POST /api/webhooks/payfast/application
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   applications (fee_status, screening trigger) + audit_log on any rejected/mismatched payment
 * Notes:  Cross-checks amount_gross against the recorded fee. Fails CLOSED on a lookup error (503) or a
 *         missing application row; ignores a duplicate delivery once fee_status is paid, so a PayFast
 *         retry cannot re-arm a completed screening and bill Searchworx twice. Refuses a payment whose live
 *         party set no longer matches the one the stamp priced (ADDENDUM_14V §3.5a) — never re-splits it.
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendPaymentReceived } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"
import { paidScreeningSubjects } from "@/lib/applications/juristicParties"
import { livePartySet, stampMatches } from "@/lib/screening/partySet"

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
      .from("applications").select("org_id, fee_amount_cents, fee_status, entity_type, applicant_type, company_info, priced_party_count, priced_entity").eq("id", applicationId).maybeSingle()
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

    if (expectedCents === null) {
      // FAIL CLOSED on NO QUOTED FEE. Until ADDENDUM_14V the column carried a literal DEFAULT, so null meant
      // "never priced" and was rare; the default is gone and the fee exists only once /api/billing/screening has
      // stamped it, which precedes every form it signs. A payment against an unpriced application cannot be
      // checked, so it is not accepted — the audit row + Sentry above make the money visible to reconciliation.
      await flagMismatch("no_quoted_fee")
      return NextResponse.json({ ok: false, reason: "no_quoted_fee" })
    }

    if (paidCents !== expectedCents) {
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

    // THE PARTY SET (ADDENDUM_14V §3.5a/b). The fee priced a set — priced_party_count natural persons, plus an entity
    // line when priced_entity. Before 14V this ITN RECOUNTED sureties here and split the money over whatever it
    // found, so a surety added after the quote was screened without being paid for (walker F1). The trigger voids a
    // stamp when the set changes, so a mismatch here means it changed between the void and this delivery: the
    // payment is refused, never re-split. Same reader as the route that stamped it.
    const party = await livePartySet(supabase, { id: applicationId, ...expectedRow })
    if (!party.ok) {
      await flagMismatch("party_set_lookup_failed")
      return NextResponse.json({ ok: false, reason: "party_set_lookup_failed" }, { status: 503 })
    }
    if (!stampMatches(expectedRow, party.set)) {
      await flagMismatch("party_set_changed")
      return NextResponse.json({ ok: false, reason: "party_set_changed" })
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

    await writePaidScreeningRows(supabase, { applicationId, orgId: expectedRow.org_id as string, paidCents, params,
      subjects: paidScreeningSubjects(expectedRow, applicationId, party.set.coIds) })

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

type Svc = Awaited<ReturnType<typeof createServiceClient>>

/**
 * ONE payment covers every subject the stamp priced (BUILD_72 P1-R8a): one application_screening_payments row
 * per subject, born paid — the application's own line (`company` for a juristic applicant, `applicant` for the
 * lead natural person, P1-R8b-1) plus one `co_applicant` per priced party row (sureties, or every live
 * residential co row). Before P1-R8a this was juristic-only, so no residential line could ever reach
 * `ready_to_run`. Each person still CONSENTS on their own link (D-14B-01, no proxy consent); the billing route
 * refuses to take payment until all of them have (14W), so these rows are born paid AND consented.
 * The set is the one just checked against the stamp, so the split is never re-derived from a different count.
 *
 * Never fails the ITN — the money is taken and the application is marked paid. A missing line blocks that
 * subject's screening, which is visible on the co-parties roster, so every failure is surfaced loudly.
 */
async function writePaidScreeningRows(supabase: Svc, input: {
  applicationId: string; orgId: string; paidCents: number; params: Record<string, string>
  subjects: ReturnType<typeof paidScreeningSubjects>
}): Promise<void> {
  const { applicationId, orgId, paidCents, params, subjects } = input
  const report = (message: string, extra: Record<string, unknown>, level: "error" | "warning" = "error") => {
    console.error(`[payfast] ${message}`, extra)
    Sentry.captureMessage(message, { level, tags: { route: "webhooks/payfast/application" }, extra: { applicationId, ...extra } })
  }

  // A row already PAID is someone's own payment record — a director can pay their portion on the director portal
  // before the lead pays (walker F5, 72-p1-r8). It is never overwritten: its amount and transaction id are the record
  // of a different payment. That person's share has then been paid twice, which is surfaced, not resolved. If the
  // read fails nothing is written: an overwrite cannot be undone, a missing row can be.
  const { data: paidRows, error: paidErr } = await supabase
    .from("application_screening_payments")
    .select("subject_type, subject_id")
    .eq("org_id", orgId)
    .eq("application_id", applicationId)
    .not("paid_at", "is", null)
  if (paidErr) {
    report("PayFast screening payment rows not written", { stage: "read_paid", error: paidErr.message })
    return
  }
  const alreadyPaid = new Set((paidRows ?? []).map((r) => `${r.subject_type}:${r.subject_id}`))
  if (alreadyPaid.size > 0) {
    report("PayFast application payment covers a subject that had already paid", { alreadyPaid: [...alreadyPaid] }, "warning")
  }

  // Split exactly over the whole priced set: the remainder goes to the first lines, so the rows sum to what was paid
  // (less any share a row already paid on its own carries in its own record).
  const base = Math.floor(paidCents / subjects.length)
  const remainder = paidCents - base * subjects.length
  const now = new Date().toISOString()
  const lines = subjects
    .map((l, i) => ({
      org_id: orgId,
      application_id: applicationId,
      subject_type: l.subject_type,
      subject_id: l.subject_id,
      fee_cents: base + (i < remainder ? 1 : 0),
      paid_at: now,
      paid_by_email: params.email_address ?? null,
      payfast_transaction_id: params.pf_payment_id || params.m_payment_id,
    }))
    .filter((l) => !alreadyPaid.has(`${l.subject_type}:${l.subject_id}`))
  if (lines.length === 0) return

  const { error: linesError } = await supabase
    .from("application_screening_payments")
    .upsert(lines, { onConflict: "application_id,subject_type,subject_id" })
  if (linesError) report("PayFast screening payment rows not written", { lineCount: lines.length, error: linesError.message })
}
