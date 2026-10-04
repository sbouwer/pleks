/**
 * lib/screening/refundOwed.ts — record a refund as OWED when a paid screening product terminally fails (ADDENDUM_14W §0c)
 *
 * Auth:   none of its own — called by the screening-line-runner cron (x-cron-secret) with the service client.
 * Data:   application_screening_payments (refund_amount_cents written once); searchworx_rates via currentRates.
 * Notes:  §0: "the only refund that can exist is a person's own check terminally failing after their own payment"
 *         (counsel Q6). Ruled 2026-10-03 (Q4/Q5): a terminal product records the refund as owed, and an admin executes
 *         it. Pleks moves no money here, and there is no payment SDK (CLAUDE.md §4).
 *         OWED = refund_amount_cents set and refunded_at NULL, on the line's own payment row. The line keeps its
 *         `failed` status; `refunded` on application_screening_lines is never written, so one fact has one home.
 *         THE ONE WRITER of the refund columns. Spec §5 said "zero writers"; the Q4 ruling makes it exactly one, and
 *         `scripts/check-refund-writers.mjs` holds every other file to naming none of them.
 *         SHARE comes from the payer's side: the stamped fee_cents, split over the products the line was PRICED on in
 *         proportion to their rates at the stamped rate_effective_date. Never from a line's cost_cents, which the
 *         billing reconcile overwrites with supplier cost. Rounded UP: a cent of doubt goes to the applicant.
 *         A share that cannot be computed (a missing rate or rate date, or a terminal product outside the line's priced
 *         set) is not guessed: no amount is written, Sentry asks a person, and an audit_log NOTE keeps it queryable.
 */
import * as Sentry from "@sentry/nextjs"
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordAudit } from "@/lib/audit/recordAudit"
import { ENTITY_LINE_PRODUCT_KEYS, SEARCHWORX_BUNDLE_SA } from "@/lib/screening/searchworxBundle"
import { currentRates } from "@/lib/searchworx/rates/read"
import { logQueryError } from "@/lib/supabase/logQueryError"
import type { ScreeningSubjectType } from "@/lib/screening/consentGuard"

/**
 * The products a line's fee was PRICED on (lineFee.bundleFor): a company line is the entity products; every natural
 * person is the SA bundle, foreign or not (14V §9.5b). The runner runs the person products for a company subject — a
 * known mismatch, queued — so a company's terminal product is not in its priced set: with nothing completed the whole
 * fee is owed, otherwise the share is undefined and a person sets it.
 */
function pricedProducts(subjectType: ScreeningSubjectType): readonly string[] {
  return subjectType === "company" ? ENTITY_LINE_PRODUCT_KEYS : SEARCHWORX_BUNDLE_SA.map((c) => c.check_code)
}

/**
 * The cents owed for the terminal products, or null when no honest number exists. Nothing completed, or every priced
 * product terminal → the whole fee. Otherwise the terminal products' rate share of the fee, rounded up, never above it.
 *
 * "Nothing completed" is its own arm because pricing and running differ: a foreign national is priced on the SA
 * bundle but VCCB never runs for them (14V §9.5b), so when their Combined report is terminal they have received
 * nothing, and a Combined-only share would keep the VCCB part of a fee for a product that could never be delivered.
 */
export function refundShareCents(
  feeCents: number,
  priced: readonly string[],
  terminal: readonly string[],
  completed: readonly string[],
  rateOf: (productKey: string) => number | undefined,
): number | null {
  const failed = priced.filter((k) => terminal.includes(k))
  if (terminal.length === 0) return null
  if (completed.length === 0 || failed.length === priced.length) return feeCents
  if (failed.length === 0) return null

  let total = 0
  let share = 0
  for (const k of priced) {
    const r = rateOf(k)
    if (r === undefined || r < 0) return null
    total += r
    if (failed.includes(k)) share += r
  }
  if (total <= 0) return null
  return Math.min(feeCents, Math.ceil((feeCents * share) / total))
}

export interface OwedRefundLine {
  orgId: string
  applicationId: string
  subjectType: ScreeningSubjectType
  subjectId: string
}

export type OwedRefundResult =
  | { recorded: true; cents: number }
  | { recorded: false; reason: "already_recorded" | "unpaid" | "no_share" | "unrecorded" }

export async function recordOwedRefund(
  db: SupabaseClient,
  line: OwedRefundLine,
  terminalProducts: readonly string[],
  completedProducts: readonly string[],
): Promise<OwedRefundResult> {
  const ctx = { applicationId: line.applicationId, subjectType: line.subjectType, subjectId: line.subjectId, terminalProducts }

  const { data: row, error } = await db
    .from("application_screening_payments")
    .select("id, fee_cents, paid_at, rate_effective_date, refund_amount_cents")
    .eq("org_id", line.orgId)
    .eq("application_id", line.applicationId)
    .eq("subject_type", line.subjectType)
    .eq("subject_id", line.subjectId)
    .maybeSingle()
  if (error) {
    logQueryError("recordOwedRefund application_screening_payments", error)
    return owedWithoutAmount(db, line, null, "unrecorded", "the payment row could not be read", ctx)
  }
  if (!row?.paid_at) {
    // The runner only takes paid lines, so this is a defect, not a case.
    return owedWithoutAmount(db, line, row?.id ?? null, "unpaid", "no paid payment row for this line", ctx)
  }
  if (row.refund_amount_cents !== null) return alreadyRecorded(ctx, row.id)

  const priced = pricedProducts(line.subjectType)
  let rates: Map<string, { costExclVatCents: number }> | null = null
  // No stamped rate date → no share. Today's rates would be a different day's split of a fee quoted earlier (walker F8).
  if (row.rate_effective_date) {
    try {
      rates = (await currentRates([...priced], row.rate_effective_date)).rates
    } catch (e) {
      Sentry.captureException(e, { tags: { area: "screening-refund" }, extra: ctx })
    }
  }
  const cents = refundShareCents(
    row.fee_cents, priced, terminalProducts, completedProducts,
    (k) => rates?.get(k)?.costExclVatCents,
  )
  if (cents === null) {
    return owedWithoutAmount(db, line, row.id, "no_share", "the share of the fee cannot be computed", { ...ctx, feeCents: row.fee_cents })
  }

  const { data: written, error: writeErr } = await db
    .from("application_screening_payments")
    .update({ refund_amount_cents: cents })
    .eq("id", row.id)
    .eq("org_id", line.orgId)
    .is("refund_amount_cents", null)
    .is("refunded_at", null)
    .select("id")
  if (writeErr) {
    logQueryError("recordOwedRefund write", writeErr)
    return owedWithoutAmount(db, line, row.id, "unrecorded", "the owed amount could not be written", { ...ctx, cents })
  }
  if (!written?.length) return alreadyRecorded(ctx, row.id)

  await recordAudit(db, {
    orgId: line.orgId, table: "application_screening_payments", recordId: row.id, action: "UPDATE",
    after: { refund_amount_cents: cents, terminal_products: [...terminalProducts], reason: "terminal_product_failure" },
  })
  Sentry.captureMessage("Screening refund owed — an admin executes it", {
    level: "warning", tags: { area: "screening-refund" }, extra: { ...ctx, paymentId: row.id, cents },
  })
  return { recorded: true, cents }
}

/**
 * A refund is owed but no amount was written. The obligation must still be FINDABLE by a query, not only by a Sentry
 * search (walker 14w-s0c F3), so a NOTE row goes to audit_log: on the payment row when there is one, else on the
 * application. Query: audit_log WHERE action = 'NOTE' AND new_values->>'refund_owed' = 'true'.
 * The subject still completes — the assessment runs on what was delivered; the money question is a person's.
 */
async function owedWithoutAmount(
  db: SupabaseClient, line: OwedRefundLine, paymentId: string | null,
  reason: Exclude<OwedRefundResult, { recorded: true }>["reason"], why: string, extra: Record<string, unknown>,
): Promise<OwedRefundResult> {
  Sentry.captureMessage(`Screening refund owed — ${why}; a person sets the amount`, {
    level: "error", tags: { area: "screening-refund" }, extra: { ...extra, paymentId, reason },
  })
  await recordAudit(db, {
    orgId: line.orgId,
    table: paymentId ? "application_screening_payments" : "applications",
    recordId: paymentId ?? line.applicationId,
    action: "NOTE",
    after: {
      refund_owed: true, amount_cents: null, reason, subject_type: line.subjectType, subject_id: line.subjectId,
      terminal_products: extra.terminalProducts ?? null,
    },
  })
  return { recorded: false, reason }
}

/** A second terminal event on a row already owing — never silent: it may be a second run's failure on the same line. */
function alreadyRecorded(extra: Record<string, unknown>, paymentId: string): OwedRefundResult {
  Sentry.captureMessage("Screening refund already recorded on this payment row — not written again", {
    level: "warning", tags: { area: "screening-refund" }, extra: { ...extra, paymentId },
  })
  return { recorded: false, reason: "already_recorded" }
}
