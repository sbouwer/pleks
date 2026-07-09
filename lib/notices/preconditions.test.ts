/**
 * lib/notices/preconditions.test.ts — the Rules 1–8 + E-2 routing matrix (pure evaluator)
 *
 * Rules 5 (CPA expiry routing) and 7 (post-termination receipts) carry the densest matrix per CD — the
 * adversarial cases: a continued tenancy must NEVER take the expiry path; an unqualified post-cancellation
 * receipt must ALWAYS trip manual review.
 */
import { describe, it, expect } from "vitest"
import { evaluateNoticePreconditions, addBusinessDays, type NoticeFacts } from "./preconditions"

const clear: NoticeFacts = {
  today: "2026-07-09",
  leaseType: "residential",
  cpaApplies: "no",
  finalNoticeSentAt: "2026-05-01",       // long past → cure expired
  arrearsResolved: false,
  priorSameTypeNotice: false,
  priorCancellation: false,
  renewalSignedOrInitiated: false,
  expiryNotificationSent: false,
  terminationNoticeGivenAt: "2026-05-01",
  noticePeriodEnd: "2026-06-01",         // past → notice period expired
  postTerminationReceipt: false,
  q13Flags: [],
  activeLegalHold: false,
}
const f = (o: Partial<NoticeFacts>): NoticeFacts => ({ ...clear, ...o })

describe("addBusinessDays", () => {
  it("skips weekends (20 business days ≈ 4 weeks)", () => {
    // Fri 2026-05-01 + 20 business days = Fri 2026-05-29
    expect(addBusinessDays("2026-05-01", 20)).toBe("2026-05-29")
    expect(addBusinessDays("2026-07-03", 1)).toBe("2026-07-06")  // Fri → Mon
  })
})

describe("Rule 8 — residential only", () => {
  it("blocks a commercial lease for every notice type", () => {
    for (const t of ["demand_vacate_breach", "demand_vacate_expiry", "demand_vacate_m2m"] as const) {
      const r = evaluateNoticePreconditions(f({ leaseType: "commercial" }), t)
      expect(r.decision).toBe("block")
      expect(r.blocks.some((b) => b.rule === "Rule 8")).toBe(true)
    }
  })
})

describe("Rule 13 — duplicate prevention", () => {
  it("blocks when a non-superseded notice of the same type already exists", () => {
    const r = evaluateNoticePreconditions(f({ priorSameTypeNotice: true }), "demand_vacate_expiry")
    expect(r.decision).toBe("block")
    expect(r.blocks.some((b) => b.rule === "Rule 13")).toBe(true)
  })
})

describe("Rule 4 — Q13 flags / legal hold halt for manual review", () => {
  it("Q13 flag → manual_review, listing the flag", () => {
    const r = evaluateNoticePreconditions(f({ q13Flags: ["debt_review"] }), "demand_vacate_m2m")
    expect(r.decision).toBe("manual_review")
    expect(r.reviews.find((x) => x.rule === "Rule 4")?.message).toContain("debt_review")
  })
  it("active legal hold → manual_review", () => {
    const r = evaluateNoticePreconditions(f({ activeLegalHold: true }), "demand_vacate_m2m")
    expect(r.decision).toBe("manual_review")
    expect(r.reviews.some((x) => x.code === "legal_hold")).toBe(true)
  })
})

describe("Rule 1 — breach preconditions", () => {
  it("allows a clean breach (final notice long expired, arrears unremedied)", () => {
    expect(evaluateNoticePreconditions(f({}), "demand_vacate_breach").decision).toBe("allow")
  })
  it("blocks when no Final Notice of Breach is on record", () => {
    const r = evaluateNoticePreconditions(f({ finalNoticeSentAt: null }), "demand_vacate_breach")
    expect(r.blocks.some((b) => b.code === "no_final_notice")).toBe(true)
  })
  it("blocks when the cure period has not yet expired", () => {
    const r = evaluateNoticePreconditions(f({ finalNoticeSentAt: "2026-07-07" }), "demand_vacate_breach")
    expect(r.blocks.some((b) => b.code === "cure_not_expired")).toBe(true)
  })
  it("blocks when the arrears appear resolved (breach remedied)", () => {
    const r = evaluateNoticePreconditions(f({ arrearsResolved: true }), "demand_vacate_breach")
    expect(r.blocks.some((b) => b.code === "breach_remedied")).toBe(true)
  })
})

describe("Rule 2 — double cancellation (breach)", () => {
  it("routes to manual review when a cancellation instrument already exists", () => {
    const r = evaluateNoticePreconditions(f({ priorCancellation: true }), "demand_vacate_breach")
    expect(r.decision).toBe("manual_review")
    expect(r.reviews.some((x) => x.rule === "Rule 2")).toBe(true)
  })
})

describe("Rule 3 — renewal signed/initiated (expiry & m2m)", () => {
  it("blocks expiry when a renewal/new term is present", () => {
    const r = evaluateNoticePreconditions(f({ renewalSignedOrInitiated: true }), "demand_vacate_expiry")
    expect(r.blocks.some((b) => b.rule === "Rule 3")).toBe(true)
  })
})

// ── Rule 5 — the CPA expiry routing matrix (E-2), the dense adversarial core ──────────────────────────
describe("Rule 5 — CPA expiry routing matrix", () => {
  it("cpa=no → Notice 2 path open (allow, no reroute)", () => {
    const r = evaluateNoticePreconditions(f({ cpaApplies: "no" }), "demand_vacate_expiry")
    expect(r.decision).toBe("allow")
    expect(r.suggestedNoticeType).toBeUndefined()
  })

  it("cpa=yes WITH a recorded expiry notification → Notice 2 allowed", () => {
    const r = evaluateNoticePreconditions(f({ cpaApplies: "yes", expiryNotificationSent: true }), "demand_vacate_expiry")
    expect(r.decision).toBe("allow")
    expect(r.suggestedNoticeType).toBeUndefined()
  })

  it("ADVERSARIAL: cpa=yes WITHOUT the record → manual review + suggest m2m (a continued tenancy must not take the expiry path)", () => {
    const r = evaluateNoticePreconditions(f({ cpaApplies: "yes", expiryNotificationSent: false }), "demand_vacate_expiry")
    expect(r.decision).toBe("manual_review")
    expect(r.reviews.some((x) => x.code === "cpa_yes_no_expiry_record")).toBe(true)
    expect(r.suggestedNoticeType).toBe("demand_vacate_m2m")
  })

  it("ADVERSARIAL: cpa=indeterminate ALWAYS → manual review + suggest m2m, even WITH an expiry record", () => {
    const r = evaluateNoticePreconditions(f({ cpaApplies: "indeterminate", expiryNotificationSent: true }), "demand_vacate_expiry")
    expect(r.decision).toBe("manual_review")
    expect(r.reviews.some((x) => x.code === "cpa_indeterminate")).toBe(true)
    expect(r.suggestedNoticeType).toBe("demand_vacate_m2m")
  })

  it("cpa=null (unset) → treated as indeterminate → manual review + suggest m2m (never assume)", () => {
    const r = evaluateNoticePreconditions(f({ cpaApplies: null, expiryNotificationSent: true }), "demand_vacate_expiry")
    expect(r.decision).toBe("manual_review")
    expect(r.suggestedNoticeType).toBe("demand_vacate_m2m")
  })

  it("Rule 5 does NOT reroute a breach or m2m request (only the expiry path is CPA-continuation-sensitive)", () => {
    expect(evaluateNoticePreconditions(f({ cpaApplies: "indeterminate" }), "demand_vacate_m2m").suggestedNoticeType).toBeUndefined()
    expect(evaluateNoticePreconditions(f({ cpaApplies: "indeterminate" }), "demand_vacate_breach").suggestedNoticeType).toBeUndefined()
  })
})

describe("Rule 6 — m2m termination preconditions", () => {
  it("allows a clean m2m (notice given, period expired)", () => {
    expect(evaluateNoticePreconditions(f({}), "demand_vacate_m2m").decision).toBe("allow")
  })
  it("blocks when no written termination notice is recorded", () => {
    const r = evaluateNoticePreconditions(f({ terminationNoticeGivenAt: null }), "demand_vacate_m2m")
    expect(r.blocks.some((b) => b.code === "no_termination_notice")).toBe(true)
  })
  it("blocks when the notice period has not expired", () => {
    const r = evaluateNoticePreconditions(f({ noticePeriodEnd: "2026-08-01" }), "demand_vacate_m2m")
    expect(r.blocks.some((b) => b.code === "notice_period_open")).toBe(true)
  })
})

// ── Rule 7 — post-termination receipts (E-1), adversarial ─────────────────────────────────────────────
describe("Rule 7 — post-termination receipts always trip manual review", () => {
  it("ADVERSARIAL: an otherwise-clean expiry with a post-termination receipt → manual_review (waiver question)", () => {
    const r = evaluateNoticePreconditions(f({ postTerminationReceipt: true }), "demand_vacate_expiry")
    expect(r.decision).toBe("manual_review")
    expect(r.reviews.some((x) => x.code === "post_termination_receipt")).toBe(true)
  })
  it("applies across all notice types (no exceptions)", () => {
    for (const t of ["demand_vacate_breach", "demand_vacate_expiry", "demand_vacate_m2m"] as const) {
      expect(evaluateNoticePreconditions(f({ postTerminationReceipt: true }), t).reviews.some((x) => x.rule === "Rule 7")).toBe(true)
    }
  })
})

describe("decision precedence", () => {
  it("a block outranks a concurrent manual-review finding", () => {
    // commercial (block, Rule 8) + a Q13 flag (review, Rule 4) → overall block
    const r = evaluateNoticePreconditions(f({ leaseType: "commercial", q13Flags: ["debt_review"] }), "demand_vacate_m2m")
    expect(r.decision).toBe("block")
    expect(r.blocks.length).toBeGreaterThan(0)
    expect(r.reviews.length).toBeGreaterThan(0)   // the review finding is still reported, just outranked
  })
})
