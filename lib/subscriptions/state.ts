/**
 * lib/subscriptions/state.ts — Subscription state machine predicates (ADDENDUM_57G)
 *
 * Notes:  Single chokepoint for all "can this org write?" decisions.
 *         Pure predicates — no DB imports; safe to import client-side.
 *         DB fetch helper lives in lib/auth/server.ts (requireAgentWriteAccess).
 */

export type SubscriptionStatus =
  | "trialing" | "active" | "past_due" | "paused"
  | "pending_cancellation" | "cancelled" | "purged"

export interface SubscriptionState {
  status:           SubscriptionStatus
  past_due_since:   Date | null
  paused_at:        Date | null
  cancelled_at:     Date | null
  purge_eligible_at: Date | null
}

/**
 * A subscription-lockdown-gated agent write. NAMING CONVENTION: lowercase `verb_noun`
 * (create_lease, sign_off_inspection, post_reserve_fund). The union is open (`| string`) so
 * new actions don't need a type edit — but ADD the literal here and follow verb_noun so the set
 * stays consistent and greppable (avoid drift like create_hoa / hoa_create / add_hoa). Lockdown
 * is action-agnostic today; a literal only carries extra meaning if mapped in ACTION_CAPABILITY.
 */
export type AgentWriteAction =
  | "create_lease" | "create_property" | "create_tenant" | "create_application"
  | "activate_lease" | "renew_lease" | "terminate_lease"
  | "sign_off_inspection" | "assign_maintenance" | "accept_quote"
  | "send_manual_comm" | "invite_user" | "change_team_role"
  | "edit_lease" | "edit_property" | "edit_tenant"
  | "run_searchworx_check" | "run_ai_clause_draft"
  // Census W3 additions (verb_noun):
  | "create_hoa" | "post_reserve_fund" | "calculate_levy" | "reformat_rules"
  | "add_lease_charge" | "remove_lease_charge"
  // Census follow-up — bulk CSV import (lockdown-only; admin authority gate at the route):
  | "bulk_import"
  | string

export type EmailFooterVariant =
  | "none" | "past_due_warning" | "paused_resume_cta" | "cancelled_purge_warning"

export type LockdownReason = "locked_paused" | "locked_cancelled"

export class SubscriptionLockdownError extends Error {
  readonly reason: LockdownReason
  readonly action: AgentWriteAction

  constructor(reason: LockdownReason, action: AgentWriteAction) {
    super(`Action "${action}" is blocked: subscription is ${reason.replace("locked_", "")}.`)
    this.name = "SubscriptionLockdownError"
    this.reason = reason
    this.action = action
  }
}

/**
 * Hard lockdown predicate. Agent UI must disable all create/edit/submit controls
 * and block all server actions with 403. Read paths, exports, audit, and
 * scheduled comms are completely unaffected.
 */
export function isOrgLockedDown(state: SubscriptionState): boolean {
  return state.status === "paused" || state.status === "cancelled"
}

/**
 * Soft-warning predicate. Agent UI shows an amber banner but writes are not blocked.
 */
export function isOrgInGrace(state: SubscriptionState): boolean {
  return state.status === "past_due"
}

/**
 * Should crons fire scheduled comms for this org?
 * Yes for all states except `purged`. Exists as a single chokepoint so future
 * state additions can't accidentally open a path to a dead org.
 */
export function shouldFireScheduledNotifications(state: SubscriptionState): boolean {
  return state.status !== "purged"
}

/**
 * Returns the email-footer variant for agent-facing emails.
 * Tenant/landlord/supplier comms always get "none" — the agency's billing
 * state is not the tenant's business.
 */
export function getAgentEmailFooter(state: SubscriptionState): EmailFooterVariant {
  switch (state.status) {
    case "past_due":  return "past_due_warning"
    case "paused":    return "paused_resume_cta"
    case "cancelled": return "cancelled_purge_warning"
    default:          return "none"
  }
}

/**
 * Capability predicate for a specific agent write action.
 * Future per-action carve-outs (e.g. "allow export even when paused") can be
 * added here without touching any callsite.
 */
export function canPerformAgentAction(
  state: SubscriptionState,
  _action: AgentWriteAction,
): { allowed: true } | { allowed: false; reason: LockdownReason } {
  if (state.status === "paused")    return { allowed: false, reason: "locked_paused" }
  if (state.status === "cancelled") return { allowed: false, reason: "locked_cancelled" }
  return { allowed: true }
}

/** The single automated non-payment ladder step for a given days-past-due (57G/57H canon, ADDENDUM_57G Step 11). */
export type DunningLadderStep = "first_notice" | "day7_reminder" | "auto_pause" | "none"

/**
 * The canonical non-payment dunning ladder: day 0 → first notice · day 7 → reminder · day ≥14 → auto-pause.
 * Pure decision over days-since-past_due_since (the dunning cron runs daily and acts on the returned step).
 * The ONLY automated non-payment transition this drives is past_due → paused; it never returns a cancel step
 * (cancellation is user-initiated only — 57H convergence). The day-7 and day-0 steps are exact-day by design
 * (idempotency is enforced separately by the comm-log check), so a missed cron day skips that notice — the
 * day-≥14 pause is the catch-all floor. Exported for the cron + its transition tests (57G Step 11).
 */
export function resolveDunningLadderStep(daysPastDue: number): DunningLadderStep {
  if (daysPastDue >= 14) return "auto_pause"
  if (daysPastDue === 7) return "day7_reminder"
  if (daysPastDue === 0) return "first_notice"
  return "none"
}
