/**
 * lib/screening/lineFee.ts — one screening line's fee: stamped on that line's own payment row (ADDENDUM_14W §0)
 *
 * Auth:   none of its own — callers have already authenticated the payer (the line's token) or the gateway (ITN).
 * Data:   application_screening_payments (one row per subject, UNIQUE (application_id, subject_type, subject_id));
 *         quoteApplicationFee for the price.
 * Notes:  §0: every person pays for their own check, and a juristic applicant's signatory pays the company's line for
 *         the company only. So a fee is per LINE, and its stamp lives on that line's payment row (14W §9 row 12) — never
 *         on `applications`, never pooled. The row is born UNPAID at first show, carrying fee_cents + the three §3.5
 *         stamp columns; trg_screening_payment_fee_immutable then refuses any change to them. Each ITN cross-checks
 *         PayFast's amount against exactly that row and marks it paid in place.
 *         Callers mint only after the line's own stage-2 consent (consent → pay → run), so an unpaid row always
 *         belongs to a consented subject and the view reads it as `consented_pending_payment`.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { quoteApplicationFee, stampColumns } from "@/lib/screening/quote"
import { logQueryError } from "@/lib/supabase/logQueryError"

export type LineSubjectType = "applicant" | "company" | "co_applicant"

export interface LineRef {
  orgId: string
  applicationId: string
  subjectType: LineSubjectType
  subjectId: string
}

export interface LineRow {
  id: string
  fee_cents: number
  paid_at: string | null
  pricing_policy_version: string | null
}

/** The SA bundle a line prices: a company line is the entity products only; every other line is one natural person. */
export function bundleFor(subjectType: LineSubjectType): { juristic: boolean; persons: number } {
  return subjectType === "company" ? { juristic: true, persons: 0 } : { juristic: false, persons: 1 }
}

/** The line's payment row, if any. `{ ok: false }` = the read failed; callers fail closed. */
export async function readLine(db: SupabaseClient, line: LineRef): Promise<{ ok: true; row: LineRow | null } | { ok: false }> {
  const { data, error } = await db
    .from("application_screening_payments")
    .select("id, fee_cents, paid_at, pricing_policy_version")
    .eq("org_id", line.orgId)
    .eq("application_id", line.applicationId)
    .eq("subject_type", line.subjectType)
    .eq("subject_id", line.subjectId)
    .maybeSingle()
  if (error) {
    logQueryError("readLine application_screening_payments", error)
    return { ok: false }
  }
  return { ok: true, row: (data as LineRow | null) ?? null }
}

export type StampResult =
  | { ok: true; cents: number }
  | { ok: false; reason: "paid" | "rates_unavailable" | "unrecorded" }

/**
 * STAMP AT FIRST SHOW (14V §3.5) on the line's own payment row. A stamped row is REUSED, never re-quoted — a rate change
 * between this show and the ITN must not reprice an open form. The insert is ON CONFLICT DO NOTHING and the row is then
 * re-read, so two concurrent first shows agree on one number. A row that exists unstamped and unpaid (none is written
 * today; the guard is for a row from before §0) is stamped in place, write-once on the null stamp.
 */
export async function stampLineFee(db: SupabaseClient, line: LineRef, context: string): Promise<StampResult> {
  const existing = await readLine(db, line)
  if (!existing.ok) return { ok: false, reason: "unrecorded" }
  if (existing.row?.paid_at) return { ok: false, reason: "paid" }
  if (existing.row?.pricing_policy_version) return { ok: true, cents: existing.row.fee_cents }

  const q = await quoteApplicationFee(bundleFor(line.subjectType), context)
  // FAIL CLOSED (14V §4): no rate → no quote, never a zero or a fallback. quote.ts has already raised Sentry.
  if (!q.ok) return { ok: false, reason: "rates_unavailable" }
  const stamp = { fee_cents: q.fee_cents, ...stampColumns(q) }

  if (existing.row) {
    const { error } = await db.from("application_screening_payments").update(stamp)
      .eq("id", existing.row.id).eq("org_id", line.orgId).is("pricing_policy_version", null).is("paid_at", null)
    if (error) {
      logQueryError("stampLineFee stamp in place", error)
      return { ok: false, reason: "unrecorded" }
    }
  } else {
    const { error } = await db.from("application_screening_payments").upsert({
      org_id: line.orgId,
      application_id: line.applicationId,
      subject_type: line.subjectType,
      subject_id: line.subjectId,
      ...stamp,
    }, { onConflict: "application_id,subject_type,subject_id", ignoreDuplicates: true })
    if (error) {
      logQueryError("stampLineFee insert", error)
      return { ok: false, reason: "unrecorded" }
    }
  }

  const after = await readLine(db, line)
  if (!after.ok || !after.row?.pricing_policy_version) return { ok: false, reason: "unrecorded" }
  if (after.row.paid_at) return { ok: false, reason: "paid" }
  return { ok: true, cents: after.row.fee_cents }
}

/**
 * Mark a stamped line paid, in place. fee_cents is NOT written: it is the quoted fee and the immutability trigger
 * refuses a change; what PayFast actually took (an overpayment) is the caller's audit row. Guarded on paid_at IS NULL so
 * a duplicate delivery racing this one writes nothing. Returns the number of rows marked (0 = already paid).
 */
export async function markLinePaid(
  db: SupabaseClient,
  line: LineRef & { rowId: string },
  payment: { paidAt: string; paidByEmail: string | null; transactionId: string | null },
): Promise<{ ok: true; marked: number } | { ok: false }> {
  const { data, error } = await db.from("application_screening_payments").update({
    paid_at: payment.paidAt,
    paid_by_email: payment.paidByEmail,
    payfast_transaction_id: payment.transactionId,
  }).eq("id", line.rowId).eq("org_id", line.orgId).is("paid_at", null).select("id")
  if (error) {
    logQueryError("markLinePaid", error)
    return { ok: false }
  }
  return { ok: true, marked: (data ?? []).length }
}
