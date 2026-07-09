/**
 * lib/notices/preconditions.test.ts — the Rules 1–8 + E-2 routing matrix (pure evaluator)
 *
 * Rules 5 (CPA expiry routing) and 7 (post-termination receipts) carry the densest matrix per CD — the
 * adversarial cases: a continued tenancy must NEVER take the expiry path; an unqualified post-cancellation
 * receipt must ALWAYS trip manual review.
 */
import { describe, it, expect } from "vitest"
import { evaluateNoticePreconditions, gatherNoticeFacts, addBusinessDays, type NoticeFacts, type GatherLease } from "./preconditions"

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
  terminationServiceEvidence: true,
  postTerminationReceipt: false,
  q13Flags: [],
  activeLegalHold: false,
}
const f = (o: Partial<NoticeFacts>): NoticeFacts => ({ ...clear, ...o })

// A filter-applying fake DB: each table has configured rows; .eq/.neq/.in/.gt narrow them; awaiting the
// chain (or .limit) resolves { data, error }. Enough of the PostgREST surface for the gatherer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gatherDb(tables: Record<string, any[]>): any {
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rows: any[] = (tables[table] ?? []).slice()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return chain },
        neq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] !== v); return chain },
        in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return chain },
        gt: (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] as never) > (v as never)); return chain },
        order: () => chain,
        limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: (x: { data: any[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      }
      return chain
    },
  }
}

const baseLease: GatherLease = {
  id: "l1", lease_type: "residential", cpa_applies_at_signing: "no", status: "notice",
  unit_id: "u1", tenant_id: "t1", start_date: "2025-01-01", end_date: "2026-06-01",
  cancellation_effective_date: null, auto_renewal_notice_sent_at: null, expiry_reminder_sent_at: null,
  notice_given_date: "2026-05-01", notice_period_end: "2026-06-01", legal_review_flags: null,
}

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
  it("degrades to manual_review when the termination notice has no findable service record (should-fix 1)", () => {
    const r = evaluateNoticePreconditions(f({ terminationServiceEvidence: false }), "demand_vacate_m2m")
    expect(r.decision).toBe("manual_review")
    expect(r.reviews.some((x) => x.code === "service_evidence_unverified")).toBe(true)
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

// ── Gatherer integration (filter-aware fake DB) — the CD walk fixes ───────────────────────────────────
describe("gatherNoticeFacts — Rule 1 stale-notice scoping (MUST-FIX)", () => {
  it("a Final Notice under a CLOSED case cannot ground a fresh cancellation → finalNoticeSentAt=null", async () => {
    const db = gatherDb({
      arrears_cases: [
        { id: "c2025", org_id: "o1", lease_id: "l1", status: "resolved" },   // remedied 2025 episode
        { id: "c2026", org_id: "o1", lease_id: "l1", status: "open" },        // fresh 2026 case, no notice yet
      ],
      arrears_actions: [
        { case_id: "c2025", action_type: "pre_legal_notice", sent_at: "2025-03-01", created_at: "2025-03-01" },
      ],
    })
    const facts = await gatherNoticeFacts(db, "o1", baseLease, "demand_vacate_breach", "2026-07-09", false)
    expect(facts.finalNoticeSentAt).toBeNull()
    expect(evaluateNoticePreconditions(facts, "demand_vacate_breach").blocks.some((b) => b.code === "no_final_notice")).toBe(true)
  })

  it("a Final Notice under the OPEN case does ground it → finalNoticeSentAt set", async () => {
    const db = gatherDb({
      arrears_cases: [{ id: "c2026", org_id: "o1", lease_id: "l1", status: "open" }],
      arrears_actions: [{ case_id: "c2026", action_type: "pre_legal_notice", sent_at: "2026-05-01", created_at: "2026-05-01" }],
    })
    const facts = await gatherNoticeFacts(db, "o1", baseLease, "demand_vacate_breach", "2026-07-09", false)
    expect(facts.finalNoticeSentAt).toBe("2026-05-01")
  })
})

describe("gatherNoticeFacts — Rule 3 renewal is tenant-scoped (SHOULD-FIX 2)", () => {
  it("a re-let to a NEW tenant on the same unit does NOT count as a renewal (holdover use case)", async () => {
    const db = gatherDb({
      leases: [{ id: "lNew", org_id: "o1", unit_id: "u1", tenant_id: "tOTHER", status: "active", start_date: "2026-07-01" }],
    })
    const facts = await gatherNoticeFacts(db, "o1", baseLease, "demand_vacate_m2m", "2026-07-09", false)
    expect(facts.renewalSignedOrInitiated).toBe(false)
  })

  it("a newer lease for the SAME tenant on the same unit DOES count as a renewal", async () => {
    const db = gatherDb({
      leases: [{ id: "lRenew", org_id: "o1", unit_id: "u1", tenant_id: "t1", status: "active", start_date: "2026-07-01" }],
    })
    const facts = await gatherNoticeFacts(db, "o1", baseLease, "demand_vacate_m2m", "2026-07-09", false)
    expect(facts.renewalSignedOrInitiated).toBe(true)
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
