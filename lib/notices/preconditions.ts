/**
 * lib/notices/preconditions.ts — Demand-to-Vacate precondition guards (Rules 1–8, LEG-NOTICES-01 Phase E)
 *
 * Notes:  The difference between "can generate a notice" and "can only generate a LAWFUL one". Split into a
 *         PURE evaluator (evaluateNoticePreconditions — the Rules 1–8 + E-2 routing matrix, tested against
 *         fact fixtures with no DB) and a gatherer (gatherNoticeFacts — reads the REAL signals, since the
 *         Phase-A lease columns have no writers yet). Three outcomes per request:
 *           block         — hard stop, cannot proceed.
 *           manual_review — halt, overridable ONLY via the E-4 confirm + reason (recorded).
 *           allow         — proceed.
 *         CD rulings E-1 (Rule 7 = flag→review, no reservation detection), E-2 (Rule 5 matrix; indeterminate
 *         always → review, m2m suggested), Rule 8 gates on leases.lease_type. Never assume — in routing as
 *         in citation.
 */

import type { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import type { CpaAppliesState } from "@/lib/comms/templates/legalCitations"
import type { DemandNoticeType } from "./issueTenantNotice"

type Db = Awaited<ReturnType<typeof createServiceClient>>

export type PreconditionDecision = "allow" | "block" | "manual_review"

export interface PreconditionFinding {
  rule: string      // "Rule 1" … "Rule 8" / "Rule 13"
  code: string      // machine code, e.g. "no_final_notice"
  message: string   // agent-facing explanation
}

export interface PreconditionResult {
  decision: PreconditionDecision
  blocks: PreconditionFinding[]
  reviews: PreconditionFinding[]
  /** Rule 5 routing suggestion when the requested path is unsafe (m2m for an ambiguous CPA expiry). */
  suggestedNoticeType?: DemandNoticeType
}

/** The gathered facts the pure evaluator reasons over. All dates are YYYY-MM-DD (UTC calendar days). */
export interface NoticeFacts {
  today: string
  leaseType: string                         // 'residential' | 'commercial' | …
  cpaApplies: CpaAppliesState               // 3-state
  // Rule 1 (breach)
  finalNoticeSentAt: string | null          // arrears_actions pre_legal_notice latest date
  arrearsResolved: boolean
  // Rule 2 / Rule 13
  priorSameTypeNotice: boolean              // a prior non-superseded notice of the requested type
  priorCancellation: boolean                // any prior demand_vacate% instrument OR a recorded cancellation
  // Rule 3 (expiry / m2m)
  renewalSignedOrInitiated: boolean
  // Rule 5 (expiry)
  expiryNotificationSent: boolean           // auto_renewal_notice_sent_at || expiry_reminder_sent_at
  // Rule 6 (m2m)
  terminationNoticeGivenAt: string | null   // leases.notice_given_date
  noticePeriodEnd: string | null            // leases.notice_period_end
  // Rule 7 (all — cutoff-relative, computed by the gatherer per requested type)
  postTerminationReceipt: boolean
  // Rule 4 (all)
  q13Flags: string[]
  activeLegalHold: boolean
}

/** CPA s14(2)(b) cure window (business days) used as the conservative v1 floor for Rule 1. A non-CPA lease
 *  whose final notice stated a longer contractual cure is the agent's responsibility (later enhancement). */
const CURE_BUSINESS_DAYS = 20

/** Add N business days (skip Sat/Sun) to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addBusinessDays(fromIso: string, n: number): string {
  const d = new Date(`${fromIso}T00:00:00.000Z`)
  let added = 0
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1)
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) added++
  }
  return d.toISOString().slice(0, 10)
}

// ── Per-rule helpers (keep the evaluator flat + each rule independently readable) ─────────────────────

function ruleBreach(f: NoticeFacts, blocks: PreconditionFinding[]): void {
  if (!f.finalNoticeSentAt) {
    blocks.push({ rule: "Rule 1", code: "no_final_notice", message: "No Final Notice of Breach is on record for this lease. Issue and expire one before a Demand to Vacate." })
    return
  }
  if (f.arrearsResolved) {
    blocks.push({ rule: "Rule 1", code: "breach_remedied", message: "The arrears case appears resolved — the breach may have been remedied. A Demand to Vacate cannot follow a remedied breach." })
  }
  if (addBusinessDays(f.finalNoticeSentAt, CURE_BUSINESS_DAYS) > f.today) {
    blocks.push({ rule: "Rule 1", code: "cure_not_expired", message: `The Final Notice cure period (${CURE_BUSINESS_DAYS} business days) has not yet expired.` })
  }
}

function ruleDoubleCancel(f: NoticeFacts, type: DemandNoticeType, reviews: PreconditionFinding[]): void {
  // Rule 2 — a breach demand is the operative cancellation; if a cancellation is already recorded from
  // another instrument, do not auto-issue a second one → manual review (double-cancellation risk).
  if (type === "demand_vacate_breach" && f.priorCancellation) {
    reviews.push({ rule: "Rule 2", code: "existing_cancellation", message: "A cancellation instrument is already recorded for this lease. Confirm this is not a double-cancellation before proceeding." })
  }
}

function ruleRenewal(f: NoticeFacts, type: DemandNoticeType, blocks: PreconditionFinding[]): void {
  // Rule 3 — expiry/m2m may not issue where a renewal or new fixed term has been signed OR initiated.
  if ((type === "demand_vacate_expiry" || type === "demand_vacate_m2m") && f.renewalSignedOrInitiated) {
    blocks.push({ rule: "Rule 3", code: "renewal_present", message: "A lease renewal or new fixed term has been signed or initiated for this unit — an expiry/termination notice cannot issue." })
  }
}

function ruleFlags(f: NoticeFacts, reviews: PreconditionFinding[]): void {
  // Rule 4 — any Q13 flag or active legal hold halts for manual legal confirmation (review triggers, not prohibitions).
  if (f.q13Flags.length > 0) {
    reviews.push({ rule: "Rule 4", code: "q13_flag", message: `Review flag(s) set: ${f.q13Flags.join(", ")}. Manual legal confirmation is required before generating.` })
  }
  if (f.activeLegalHold) {
    reviews.push({ rule: "Rule 4", code: "legal_hold", message: "An active legal hold exists on this lease. Manual legal confirmation is required before generating." })
  }
}

/** Rule 5 — CPA expiry routing (E-2). Returns a routing suggestion (m2m) when the expiry path is unsafe. */
function ruleExpiryRouting(f: NoticeFacts, reviews: PreconditionFinding[]): DemandNoticeType | undefined {
  if (f.cpaApplies === "no") return undefined                        // Notice 2 path open
  if (f.cpaApplies === "yes") {
    if (f.expiryNotificationSent) return undefined                    // recorded s14(2)(b)(ii) notification → Notice 2 allowed
    reviews.push({ rule: "Rule 5", code: "cpa_yes_no_expiry_record", message: "The CPA governs but no expiry notification is recorded. The tenancy may have continued month-to-month under s14(2)(d) — route via the month-to-month path." })
    return "demand_vacate_m2m"
  }
  // indeterminate / null → always manual review, m2m suggested (never assume the CPA does not govern)
  reviews.push({ rule: "Rule 5", code: "cpa_indeterminate", message: "CPA applicability is indeterminate — the expiry path cannot be confirmed safe. The month-to-month path is the suggested route." })
  return "demand_vacate_m2m"
}

function ruleM2m(f: NoticeFacts, blocks: PreconditionFinding[]): void {
  // Rule 6 — a written termination notice must be recorded AND its notice period expired.
  if (!f.terminationNoticeGivenAt) {
    blocks.push({ rule: "Rule 6", code: "no_termination_notice", message: "No written termination notice is recorded for this lease. Serve one (with notice period) before a Demand to Vacate." })
    return
  }
  if (f.noticePeriodEnd && f.noticePeriodEnd > f.today) {
    blocks.push({ rule: "Rule 6", code: "notice_period_open", message: `The termination notice period has not yet expired (ends ${f.noticePeriodEnd}).` })
  }
}

function ruleReceipts(f: NoticeFacts, reviews: PreconditionFinding[]): void {
  // Rule 7 (E-1) — any receipt after the termination date → flag → manual review, no exceptions. Do NOT
  // try to detect whether a reservation "was recorded" (nothing records one); a human weighs the waiver.
  if (f.postTerminationReceipt) {
    reviews.push({ rule: "Rule 7", code: "post_termination_receipt", message: "Payments or invoices are recorded against this lease after the termination date. Review the waiver / tacit-renewal question before proceeding." })
  }
}

/** block wins over manual_review wins over allow. */
function decide(blocks: PreconditionFinding[], reviews: PreconditionFinding[]): PreconditionDecision {
  if (blocks.length > 0) return "block"
  if (reviews.length > 0) return "manual_review"
  return "allow"
}

/**
 * PURE — evaluate Rules 1–8 (+ Rule 13 dup-prevention) for a requested notice type against gathered facts.
 * No DB access; deterministic; the home of the E-2 routing matrix. block > manual_review > allow.
 */
export function evaluateNoticePreconditions(facts: NoticeFacts, type: DemandNoticeType): PreconditionResult {
  const blocks: PreconditionFinding[] = []
  const reviews: PreconditionFinding[] = []
  let suggestedNoticeType: DemandNoticeType | undefined

  // Rule 8 — residential only (gates on lease_type, never property type).
  if (facts.leaseType !== "residential") {
    blocks.push({ rule: "Rule 8", code: "not_residential", message: "The residential Demand-to-Vacate suite does not apply to a commercial lease." })
  }

  // Rule 13 — a prior non-superseded notice of the SAME type already exists → re-issue must supersede.
  if (facts.priorSameTypeNotice) {
    blocks.push({ rule: "Rule 13", code: "duplicate_notice", message: "A notice of this type has already been issued for this lease. Re-issuing must be an explicit supersede, not a new generation." })
  }

  ruleFlags(facts, reviews)                    // Rule 4 — all types
  ruleReceipts(facts, reviews)                 // Rule 7 — all types

  if (type === "demand_vacate_breach") {
    ruleBreach(facts, blocks)                  // Rule 1
    ruleDoubleCancel(facts, type, reviews)     // Rule 2
  } else {
    ruleRenewal(facts, type, blocks)           // Rule 3 — expiry / m2m
    if (type === "demand_vacate_expiry") suggestedNoticeType = ruleExpiryRouting(facts, reviews)  // Rule 5
    if (type === "demand_vacate_m2m") ruleM2m(facts, blocks)                                       // Rule 6
  }

  return { decision: decide(blocks, reviews), blocks, reviews, suggestedNoticeType }
}

// ── Fact gathering (the real signals; Phase-A lease columns have no writers yet) ──────────────────────

/** The lease fields the gatherer needs (fetch once in the caller, pass here). */
export interface GatherLease {
  id: string
  lease_type: string | null
  cpa_applies_at_signing: CpaAppliesState
  status: string | null
  unit_id: string | null
  start_date: string | null
  end_date: string | null
  cancellation_effective_date: string | null
  auto_renewal_notice_sent_at: string | null
  expiry_reminder_sent_at: string | null
  notice_given_date: string | null
  notice_period_end: string | null
  legal_review_flags: Record<string, { value?: boolean }> | null
}

/** The cutoff date (YYYY-MM-DD) after which a receipt is "post-termination" for Rule 7, per requested type. */
function receiptCutoff(lease: GatherLease, type: DemandNoticeType): string | null {
  if (type === "demand_vacate_expiry") return lease.end_date
  if (type === "demand_vacate_m2m") return lease.notice_period_end
  return lease.cancellation_effective_date   // breach — only if a prior cancellation date exists
}

async function gatherFinalNotice(db: Db, orgId: string, leaseId: string): Promise<{ sentAt: string | null; resolved: boolean }> {
  // Final Notice of Breach is the arrears ladder's 'pre_legal_notice' step, reached via arrears_cases.lease_id.
  const { data: cases, error } = await db.from("arrears_cases").select("id, status").eq("org_id", orgId).eq("lease_id", leaseId)
  logQueryError("gatherNoticeFacts arrears_cases", error)
  const caseIds = (cases ?? []).map((c) => c.id as string)
  if (caseIds.length === 0) return { sentAt: null, resolved: false }
  const resolved = (cases ?? []).every((c) => c.status === "resolved")
  const { data: actions, error: aErr } = await db.from("arrears_actions")
    .select("sent_at, created_at").in("case_id", caseIds).eq("action_type", "pre_legal_notice")
    .order("created_at", { ascending: false }).limit(1)
  logQueryError("gatherNoticeFacts arrears_actions", aErr)
  const row = actions?.[0]
  const sentAtRaw = (row?.sent_at ?? row?.created_at) as string | undefined
  return { sentAt: sentAtRaw ? sentAtRaw.slice(0, 10) : null, resolved }
}

async function gatherPriorNotices(db: Db, orgId: string, leaseId: string, type: DemandNoticeType): Promise<{ sameType: boolean; anyCancellation: boolean }> {
  const { data, error } = await db.from("tenant_notices").select("id, notice_type, supersedes").eq("org_id", orgId).eq("lease_id", leaseId)
  logQueryError("gatherNoticeFacts tenant_notices", error)
  const rows = data ?? []
  // A row is superseded if another row points at its id via `supersedes` (new→old). Live = not superseded.
  const supersededIds = new Set(rows.map((r) => r.supersedes).filter(Boolean))
  const live = rows.filter((r) => !supersededIds.has(r.id))
  const sameType = live.some((r) => r.notice_type === type)
  const anyCancellation = rows.some((r) => typeof r.notice_type === "string" && r.notice_type.startsWith("demand_vacate"))
  return { sameType, anyCancellation }
}

async function gatherRenewal(db: Db, orgId: string, lease: GatherLease): Promise<boolean> {
  // Proxy: a newer active/pending lease for the same unit (lease_renewal_offers is schema-only, no writers).
  if (!lease.unit_id) return false
  const { data, error } = await db.from("leases").select("id, start_date, status")
    .eq("org_id", orgId).eq("unit_id", lease.unit_id).neq("id", lease.id)
    .in("status", ["active", "pending_signing"])
  logQueryError("gatherNoticeFacts renewal proxy", error)
  return (data ?? []).some((l) => (l.start_date as string | null) && lease.start_date && (l.start_date as string) > lease.start_date)
}

async function gatherReceipts(db: Db, orgId: string, leaseId: string, cutoff: string | null): Promise<boolean> {
  if (!cutoff) return false
  const [pay, inv, trust] = await Promise.all([
    db.from("payments").select("id").eq("org_id", orgId).eq("lease_id", leaseId).gt("payment_date", cutoff).limit(1),
    db.from("rent_invoices").select("id").eq("org_id", orgId).eq("lease_id", leaseId).gt("invoice_date", cutoff).limit(1),
    db.from("trust_transactions").select("id").eq("org_id", orgId).eq("lease_id", leaseId).gt("statement_month", cutoff).limit(1),
  ])
  logQueryError("gatherNoticeFacts payments", pay.error)
  logQueryError("gatherNoticeFacts rent_invoices", inv.error)
  logQueryError("gatherNoticeFacts trust_transactions", trust.error)
  return Boolean(pay.data?.length || inv.data?.length || trust.data?.length)
}

function q13SetFlags(flags: GatherLease["legal_review_flags"]): string[] {
  if (!flags) return []
  return Object.entries(flags).filter(([, v]) => v?.value === true).map(([k]) => k)
}

/**
 * Gather the real-signal facts for a lease + requested type. `today` is injected for deterministic tests.
 * `activeLegalHold` is passed in by the caller (it owns the legal_hold_events read via lib/legal/holds).
 */
export async function gatherNoticeFacts(
  db: Db, orgId: string, lease: GatherLease, type: DemandNoticeType, today: string, activeLegalHold: boolean,
): Promise<NoticeFacts> {
  const [finalNotice, prior, renewal, postTerminationReceipt] = await Promise.all([
    gatherFinalNotice(db, orgId, lease.id),
    gatherPriorNotices(db, orgId, lease.id, type),
    gatherRenewal(db, orgId, lease),
    gatherReceipts(db, orgId, lease.id, receiptCutoff(lease, type)),
  ])
  return {
    today,
    leaseType: lease.lease_type ?? "",
    cpaApplies: lease.cpa_applies_at_signing,
    finalNoticeSentAt: finalNotice.sentAt,
    arrearsResolved: finalNotice.resolved,
    priorSameTypeNotice: prior.sameType,
    priorCancellation: prior.anyCancellation || Boolean(lease.cancellation_effective_date),
    renewalSignedOrInitiated: renewal,
    expiryNotificationSent: Boolean(lease.auto_renewal_notice_sent_at || lease.expiry_reminder_sent_at),
    terminationNoticeGivenAt: lease.notice_given_date,
    noticePeriodEnd: lease.notice_period_end,
    postTerminationReceipt,
    q13Flags: q13SetFlags(lease.legal_review_flags),
    activeLegalHold,
  }
}
