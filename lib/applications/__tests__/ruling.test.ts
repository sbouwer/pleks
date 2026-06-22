/**
 * lib/applications/__tests__/ruling.test.ts — the 14M affordability prescreen ruling (ADDENDUM_14M)
 *
 * Pins the two-axis tiers + the flag catalogue from a mock ReconciliationResult + declared income/rent.
 * Determinism is the point (replay) — `now` is injected. Covers the guarded flag-0 override (fix #1),
 * uncorroborated→flag 5 with the right prompt, probation, identity, the net-pay SIGNAL (not a to-do).
 */
import { describe, it, expect } from "vitest"
import { evaluateRuling, type RulingInput } from "../ruling"
import type { ReconciliationResult } from "@/lib/extraction/types"

const NOW = new Date("2026-06-20T00:00:00Z")

function recon(over: Partial<ReconciliationResult> = {}): ReconciliationResult {
  return {
    reconcilerVersion: "recon.v1",
    declaredSources: [{ source_key: "employment", label: "Employment (gross)", declared_monthly_cents: 2_800_000, evidenced_monthly_cents: 2_800_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "payslip" }],
    housingPayment: { detected: false, recurring_monthly_cents: null, months_observed: 0, anyMissedOrReturned: false },
    netPayVsCredit: { payslip_net_cents: 1_900_000, bank_salary_credit_cents: 1_900_000, gap_pct: 0, verdict: "match" },
    identity: { name: "consistent", idNumber: "consistent" },
    recency: { oldestDocumentDate: "2026-03-31", newestDocumentDate: "2026-05-31", mostRecentWithinDays: 20, salariedMonthsCovered: 3, monthsCovered: ["2026-03", "2026-04", "2026-05"], consecutive: true },
    ...over,
  }
}
function input(over: Partial<RulingInput> = {}): RulingInput {
  return { appliedRentCents: 700_000, declaredMonthlyIncomeCents: 2_800_000, employmentType: "permanent", employmentStartDate: "2020-01-01", reconciliation: recon(), now: NOW, ...over }
}
const flag = (r: ReturnType<typeof evaluateRuling>, id: number) => r.flags.find((f) => f.id === id)

describe("evaluateRuling — affordability axis", () => {
  it("clean ratio + corroborated + recent → within + strong", () => {
    const r = evaluateRuling(input())
    expect(r.affordability.tier).toBe("within")
    expect(r.rulingTier).toBe("strong")
    expect(flag(r, 1)).toBeUndefined()
  })
  it("marginal ratio (32%) → marginal + a minor flag, capped to adequate (not strong)", () => {
    const r = evaluateRuling(input({ appliedRentCents: 900_000 }))
    expect(r.affordability.tier).toBe("marginal")
    expect(flag(r, 1)?.severity).toBe("minor")
    expect(r.rulingTier).toBe("adequate")
  })
  it("ratio over 35% → below + below-threshold ruling", () => {
    const r = evaluateRuling(input({ appliedRentCents: 1_500_000 }))
    expect(r.affordability.tier).toBe("below")
    expect(r.rulingTier).toBe("below-threshold")
    expect(flag(r, 1)?.severity).toBe("block")
  })
  it("no declared income → block", () => {
    const r = evaluateRuling(input({ declaredMonthlyIncomeCents: 0 }))
    expect(r.rulingTier).toBe("below-threshold")
    expect(flag(r, 1)?.severity).toBe("block")
  })
})

describe("evaluateRuling — flag-0 demonstrated-payment override (fix #1: guarded)", () => {
  const failing = { appliedRentCents: 800_000, declaredMonthlyIncomeCents: 1_500_000 } // 53% — below
  it("overrides a failing ratio when sustained (≥6 months) + clean + covers the rent", () => {
    const r = evaluateRuling(input({ ...failing, reconciliation: recon({ housingPayment: { detected: true, recurring_monthly_cents: 800_000, months_observed: 6, anyMissedOrReturned: false } }) }))
    expect(r.affordability.tier).toBe("demonstrated-override")
    expect(r.rulingTier).not.toBe("below-threshold")
    expect(flag(r, 0)?.severity).toBe("positive")
  })
  it("does NOT override on only 3 months", () => {
    const r = evaluateRuling(input({ ...failing, reconciliation: recon({ housingPayment: { detected: true, recurring_monthly_cents: 800_000, months_observed: 3, anyMissedOrReturned: false } }) }))
    expect(r.affordability.tier).toBe("below")
    expect(r.rulingTier).toBe("below-threshold")
  })
  it("does NOT override when the housing history has a missed/returned month", () => {
    const r = evaluateRuling(input({ ...failing, reconciliation: recon({ housingPayment: { detected: true, recurring_monthly_cents: 800_000, months_observed: 8, anyMissedOrReturned: true } }) }))
    expect(r.affordability.tier).toBe("below")
  })
})

describe("evaluateRuling — confidence flags", () => {
  it("uncorroborated source → flag 5 (fixable) with a source-aware upload prompt + needs-evidence", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ declaredSources: [{ source_key: "rental", label: "Rental income", declared_monthly_cents: 500_000, evidenced_monthly_cents: null, variance_pct: null, match_confidence: 0, status: "uncorroborated", evidenceDocType: null }] }) }))
    const f5 = flag(r, 5)
    expect(f5?.type).toBe("fixable")
    expect(f5?.remediation).toMatch(/rent/i)
    expect(r.confidence.tier).toBe("needs-evidence")
  })
  it("OVER-declared variance (declared > documented) → flag 6", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ declaredSources: [{ source_key: "employment", label: "Employment (gross)", declared_monthly_cents: 2_800_000, evidenced_monthly_cents: 2_000_000, variance_pct: 29, match_confidence: 0.6, status: "variance", evidenceDocType: "payslip" }] }) }))
    expect(flag(r, 6)).toBeDefined()
    expect(r.confidence.tier).toBe("needs-evidence")
  })
  it("UNDER-declared variance (documents show MORE) → NO flag 6 (conservative, supported)", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ declaredSources: [{ source_key: "employment", label: "Employment (gross)", declared_monthly_cents: 1_750_000, evidenced_monthly_cents: 2_460_000, variance_pct: -41, match_confidence: 0.6, status: "variance", evidenceDocType: "payslip" }] }) }))
    expect(flag(r, 6)).toBeUndefined()
  })
  it("probation → flag 2 (minor) when started recently", () => {
    const r = evaluateRuling(input({ employmentStartDate: "2026-05-01" }))
    expect(flag(r, 2)?.severity).toBe("minor")
  })
  it("stale + non-consecutive docs → flags 3 and 4", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ recency: { oldestDocumentDate: "2026-01-31", newestDocumentDate: "2026-03-31", mostRecentWithinDays: 81, salariedMonthsCovered: 2, monthsCovered: ["2026-01", "2026-03"], consecutive: false } }) }))
    expect(flag(r, 3)).toBeDefined()
    expect(flag(r, 4)).toBeDefined()
  })
})

describe("evaluateRuling — integrity / risk", () => {
  it("identity HARD mismatch (different surname) → flag 7 major → needs-evidence", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ identity: { name: "material-mismatch", idNumber: "consistent" } }) }))
    expect(flag(r, 7)?.severity).toBe("major")
    expect(r.confidence.tier).toBe("needs-evidence")
  })
  it("identity HARD mismatch (ID number) → flag 7 major even if name is consistent", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ identity: { name: "consistent", idNumber: "mismatch" } }) }))
    expect(flag(r, 7)?.severity).toBe("major")
  })
  it("identity SOFT variation (initials/maiden) → flag 7 MINOR (not needs-evidence)", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ identity: { name: "minor-variation", idNumber: "consistent" } }) }))
    expect(flag(r, 7)?.severity).toBe("minor")
    expect(r.confidence.tier).not.toBe("needs-evidence")
  })
  it("net-pay gap → flag 8 as a SIGNAL (agent-facing, not an applicant to-do)", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ netPayVsCredit: { payslip_net_cents: 1_900_000, bank_salary_credit_cents: 1_400_000, gap_pct: 26, verdict: "gap" } }) }))
    const f8 = flag(r, 8)
    expect(f8?.type).toBe("signal")
    expect(f8?.remediation).toBeNull()
  })
})
