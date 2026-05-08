/**
 * lib/subscriptions/state.test.ts — Unit tests for subscription state machine predicates
 *
 * Run: npx vitest run lib/subscriptions/state.test.ts
 */
import { describe, it, expect } from "vitest"
import {
  isOrgLockedDown,
  isOrgInGrace,
  shouldFireScheduledNotifications,
  getAgentEmailFooter,
  canPerformAgentAction,
  SubscriptionLockdownError,
  type SubscriptionState,
} from "./state"

function makeState(status: SubscriptionState["status"]): SubscriptionState {
  return { status, past_due_since: null, paused_at: null, cancelled_at: null, purge_eligible_at: null }
}

const ALL_STATUSES: SubscriptionState["status"][] = [
  "trialing", "active", "past_due", "paused", "pending_cancellation", "cancelled", "purged",
]

// ── isOrgLockedDown ──────────────────────────────────────────────────────────

describe("isOrgLockedDown", () => {
  it("returns true only for paused and cancelled", () => {
    expect(isOrgLockedDown(makeState("paused"))).toBe(true)
    expect(isOrgLockedDown(makeState("cancelled"))).toBe(true)
  })

  it("returns false for all other statuses", () => {
    for (const s of ALL_STATUSES.filter(s => s !== "paused" && s !== "cancelled")) {
      expect(isOrgLockedDown(makeState(s))).toBe(false)
    }
  })
})

// ── isOrgInGrace ─────────────────────────────────────────────────────────────

describe("isOrgInGrace", () => {
  it("returns true only for past_due", () => {
    expect(isOrgInGrace(makeState("past_due"))).toBe(true)
  })

  it("returns false for all other statuses", () => {
    for (const s of ALL_STATUSES.filter(s => s !== "past_due")) {
      expect(isOrgInGrace(makeState(s))).toBe(false)
    }
  })
})

// ── shouldFireScheduledNotifications ─────────────────────────────────────────

describe("shouldFireScheduledNotifications", () => {
  it("returns false only for purged", () => {
    expect(shouldFireScheduledNotifications(makeState("purged"))).toBe(false)
  })

  it("returns true for all non-purged statuses (crons always fire)", () => {
    for (const s of ALL_STATUSES.filter(s => s !== "purged")) {
      expect(shouldFireScheduledNotifications(makeState(s))).toBe(true)
    }
  })
})

// ── getAgentEmailFooter ───────────────────────────────────────────────────────

describe("getAgentEmailFooter", () => {
  it("returns correct variant per status", () => {
    expect(getAgentEmailFooter(makeState("past_due"))).toBe("past_due_warning")
    expect(getAgentEmailFooter(makeState("paused"))).toBe("paused_resume_cta")
    expect(getAgentEmailFooter(makeState("cancelled"))).toBe("cancelled_purge_warning")
  })

  it("returns 'none' for all other statuses", () => {
    for (const s of ALL_STATUSES.filter(
      s => !["past_due", "paused", "cancelled"].includes(s),
    )) {
      expect(getAgentEmailFooter(makeState(s))).toBe("none")
    }
  })
})

// ── canPerformAgentAction ─────────────────────────────────────────────────────

describe("canPerformAgentAction", () => {
  it("blocks with locked_paused when paused", () => {
    const result = canPerformAgentAction(makeState("paused"), "create_lease")
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toBe("locked_paused")
  })

  it("blocks with locked_cancelled when cancelled", () => {
    const result = canPerformAgentAction(makeState("cancelled"), "create_lease")
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toBe("locked_cancelled")
  })

  it("allows all actions for active statuses", () => {
    for (const s of ["trialing", "active", "past_due", "pending_cancellation"] as const) {
      const result = canPerformAgentAction(makeState(s), "create_lease")
      expect(result.allowed).toBe(true)
    }
  })

  it("same result regardless of action string (no per-action carve-outs in v1)", () => {
    const actions = ["create_lease", "edit_property", "send_manual_comm", "run_ai_clause_draft"]
    for (const action of actions) {
      expect(canPerformAgentAction(makeState("paused"), action).allowed).toBe(false)
      expect(canPerformAgentAction(makeState("active"), action).allowed).toBe(true)
    }
  })
})

// ── SubscriptionLockdownError ─────────────────────────────────────────────────

describe("SubscriptionLockdownError", () => {
  it("is an instance of Error", () => {
    const err = new SubscriptionLockdownError("locked_paused", "create_lease")
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SubscriptionLockdownError)
  })

  it("has correct name, reason, and action", () => {
    const err = new SubscriptionLockdownError("locked_cancelled", "edit_property")
    expect(err.name).toBe("SubscriptionLockdownError")
    expect(err.reason).toBe("locked_cancelled")
    expect(err.action).toBe("edit_property")
  })

  it("message describes the block clearly", () => {
    const err = new SubscriptionLockdownError("locked_paused", "create_lease")
    expect(err.message).toContain("create_lease")
    expect(err.message).toContain("paused")
  })
})
