/**
 * lib/applications/__tests__/ruling.test.ts — the 14M affordability prescreen ruling (ADDENDUM_14M)
 *
 * Pins the two-axis tiers + the flag catalogue from a mock ReconciliationResult + declared income/rent.
 * Determinism is the point (replay) — `now` is injected. Covers the guarded flag-0 override (fix #1),
 * uncorroborated→flag 5 with the right prompt, probation, identity, the net-pay SIGNAL (not a to-do).
 */
import { describe, it, expect } from "vitest"
import { evaluateRuling, RULING_VERSION, type RulingInput } from "../ruling"
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
    observedObligationsCents: null,
    ...over,
  }
}
function input(over: Partial<RulingInput> = {}): RulingInput {
  return { appliedRentCents: 700_000, declaredMonthlyIncomeCents: 2_800_000, employmentType: "permanent", employmentStartDate: "2020-01-01", reconciliation: recon(), now: NOW, ...over }
}
const flag = (r: ReturnType<typeof evaluateRuling>, id: number) => r.flags.find((f) => f.id === id)
// Corroborated income that does NOT clear the living floor against the rent — isolates the affordability TIER and
// the housing override from flag 0b's residual override (which legitimately rescues high-income marginal/below).
const lowCorrob = (cents: number) => ({ declaredSources: [{ source_key: "employment", label: "Employment (gross)", declared_monthly_cents: cents, evidenced_monthly_cents: cents, variance_pct: 0, match_confidence: 0.9, status: "corroborated" as const, evidenceDocType: "payslip" as const }] })

describe("evaluateRuling — affordability axis", () => {
  it("clean ratio + corroborated + recent → within + strong (and NO major flags creep in)", () => {
    const r = evaluateRuling(input())
    expect(r.affordability.tier).toBe("within")
    expect(r.rulingTier).toBe("strong")
    expect(flag(r, 1)).toBeUndefined()
    expect(r.flags.filter((f) => f.severity === "major")).toHaveLength(0) // a stray major flag can't sneak through
  })
  it("marginal ratio (34%, residual below floor) → marginal + a minor flag, capped to adequate (not strong)", () => {
    const r = evaluateRuling(input({ appliedRentCents: 170_000, declaredMonthlyIncomeCents: 500_000, reconciliation: recon(lowCorrob(500_000)) }))
    expect(r.affordability.tier).toBe("marginal")
    expect(flag(r, 1)?.severity).toBe("minor")
    expect(r.rulingTier).toBe("adequate")
  })
  it("ratio over 35% (residual below floor) → below + below-threshold ruling", () => {
    const r = evaluateRuling(input({ appliedRentCents: 250_000, declaredMonthlyIncomeCents: 500_000, reconciliation: recon(lowCorrob(500_000)) }))
    expect(r.affordability.tier).toBe("below")
    expect(r.rulingTier).toBe("below-threshold")
    expect(flag(r, 1)?.severity).toBe("block")
  })
  it("no declared income → block", () => {
    const r = evaluateRuling(input({ declaredMonthlyIncomeCents: 0, reconciliation: recon({ declaredSources: [] }) }))
    expect(r.rulingTier).toBe("below-threshold")
    expect(flag(r, 1)?.severity).toBe("block")
  })
})

describe("evaluateRuling — child maintenance (single-place accounting)", () => {
  it("excludes received child maintenance from the rent-payable ratio — nets to salary, not gross, not below salary", () => {
    // gross 28k = 20k salary + 8k child maintenance; rent 7k → 35% on salary (would be 25% on gross, 58% if penalised).
    const r = evaluateRuling(input({ declaredMonthlyIncomeCents: 2_800_000, childMaintenanceCents: 800_000, appliedRentCents: 700_000 }))
    expect(r.affordability.ratioPct).toBe(35)
  })
  it("excludes child maintenance from corroborated income (verified maintenance is not rent-payable)", () => {
    const reconMaint = recon({ declaredSources: [
      { source_key: "employment", label: "Employment", declared_monthly_cents: 2_000_000, evidenced_monthly_cents: 2_000_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "payslip" },
      { source_key: "maintenance", label: "Maintenance (child)", declared_monthly_cents: 800_000, evidenced_monthly_cents: 800_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "bank-statement" },
    ] })
    const r = evaluateRuling(input({ declaredMonthlyIncomeCents: 2_800_000, childMaintenanceCents: 800_000, reconciliation: reconMaint, minorDependents: 2 }))
    expect(r.affordability.corroboratedIncomeCents).toBe(2_000_000)
  })
  it("verified child maintenance offsets the child's floor cost ONCE, capped — flips a case that fails the full floor", () => {
    // salary 10k (gross 18k − 8k child maintenance), rent 6k → below ratio; corroborated salary 10k → residual 4k.
    // 2 dependents → full floor 7k (residual 4k fails); 8k verified maintenance offsets the 3.5k child cost → floor
    // 3.5k → residual 4k now clears it. (Surplus 4.5k of maintenance vanishes — capped at the child cost.)
    const reconMaint = recon({ observedObligationsCents: 0, declaredSources: [
      { source_key: "employment", label: "Employment", declared_monthly_cents: 1_000_000, evidenced_monthly_cents: 1_000_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "payslip" },
      { source_key: "maintenance", label: "Maintenance (child)", declared_monthly_cents: 800_000, evidenced_monthly_cents: 800_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "bank-statement" },
    ] })
    const withMaint = evaluateRuling(input({ declaredMonthlyIncomeCents: 1_800_000, childMaintenanceCents: 800_000, appliedRentCents: 600_000, reconciliation: reconMaint, minorDependents: 2 }))
    expect(withMaint.affordability.tier).toBe("residual-override")
    // Without the maintenance offset the SAME residual fails the full (un-reduced) floor → stays below.
    const reconNoMaint = recon({ observedObligationsCents: 0, declaredSources: [
      { source_key: "employment", label: "Employment", declared_monthly_cents: 1_000_000, evidenced_monthly_cents: 1_000_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "payslip" },
    ] })
    const noMaint = evaluateRuling(input({ declaredMonthlyIncomeCents: 1_000_000, appliedRentCents: 600_000, reconciliation: reconNoMaint, minorDependents: 2 }))
    expect(noMaint.affordability.tier).toBe("below")
  })
  it("school fees join the child bucket (offset by maintenance) — not double-counted with commitments", () => {
    // 1 minor floor 1.75k + school fees 3k = 4.75k child bucket; 3k maintenance → net child 1.75k.
    // adult floor 3.5k + net child 1.75k = 5.25k floor. Salary 10k, rent 5k, no obligations → residual 5k < 5.25k → below.
    const reconMaint = recon({ observedObligationsCents: 0, declaredSources: [
      { source_key: "employment", label: "Employment", declared_monthly_cents: 1_000_000, evidenced_monthly_cents: 1_000_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "payslip" },
      { source_key: "maintenance", label: "Maintenance (child)", declared_monthly_cents: 300_000, evidenced_monthly_cents: 300_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "bank-statement" },
    ] })
    const r = evaluateRuling(input({ declaredMonthlyIncomeCents: 1_300_000, childMaintenanceCents: 300_000, appliedRentCents: 500_000, reconciliation: reconMaint, minorDependents: 1, schoolFeesCents: 300_000 }))
    expect(r.affordability.tier).toBe("below")           // residual 5k just under the 5.25k floor (fees count, capped by maintenance)
    // Without school fees the bucket is fully covered by maintenance → floor drops to 3.5k → residual 5k clears it.
    const rNoFees = evaluateRuling(input({ declaredMonthlyIncomeCents: 1_300_000, childMaintenanceCents: 300_000, appliedRentCents: 500_000, reconciliation: reconMaint, minorDependents: 1, schoolFeesCents: 0 }))
    expect(rNoFees.affordability.tier).toBe("residual-override")
  })
})

describe("evaluateRuling — flag-0 demonstrated-payment override (fix #1: guarded)", () => {
  const failing = { appliedRentCents: 250_000, declaredMonthlyIncomeCents: 300_000 } // 83% — below; residual won't clear
  const lowHousing = (housing: object) => recon({ ...lowCorrob(300_000), housingPayment: housing as never })
  it("overrides a failing ratio when sustained (≥6 months) + clean + covers the rent", () => {
    const r = evaluateRuling(input({ ...failing, reconciliation: lowHousing({ detected: true, recurring_monthly_cents: 250_000, months_observed: 6, anyMissedOrReturned: false }) }))
    expect(r.affordability.tier).toBe("demonstrated-override")
    expect(r.rulingTier).not.toBe("below-threshold")
    expect(flag(r, 0)?.severity).toBe("positive")
  })
  it("does NOT override on only 3 months", () => {
    const r = evaluateRuling(input({ ...failing, reconciliation: lowHousing({ detected: true, recurring_monthly_cents: 250_000, months_observed: 3, anyMissedOrReturned: false }) }))
    expect(r.affordability.tier).toBe("below")
    expect(r.rulingTier).toBe("below-threshold")
  })
  it("does NOT override when the housing history has a missed/returned month", () => {
    const r = evaluateRuling(input({ ...failing, reconciliation: lowHousing({ detected: true, recurring_monthly_cents: 250_000, months_observed: 8, anyMissedOrReturned: true }) }))
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

describe("evaluateRuling — flag 0b residual-income override", () => {
  // Rent R8,000 = 32% of declared R25,000 → marginal. Corroborated R25,000, obligations R1,000.
  // Residual = 25000 - 8000 - 1000 = R16,000. Floor (1 adult, 0 deps) = R3,500 → clears → override.
  const marginalOver = () => input({
    appliedRentCents: 800_000, declaredMonthlyIncomeCents: 2_500_000,
    adults: 1, minorDependents: 0,
    reconciliation: recon({
      observedObligationsCents: 100_000,
      declaredSources: [{ source_key: "employment", label: "Employment (gross)", declared_monthly_cents: 2_500_000, evidenced_monthly_cents: 2_500_000, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "payslip" }],
    }),
  })
  it("marginal ratio + residual clears the living floor → residual-override (not blocked)", () => {
    const r = evaluateRuling(marginalOver())
    expect(r.affordability.tier).toBe("residual-override")
    expect(r.rulingTier).not.toBe("below-threshold") // the whole point of the override: no longer blocked
    expect(flag(r, 0)?.type).toBe("override")
    expect(flag(r, 1)).toBeUndefined()  // affordability concern flag suppressed
  })
  it("does NOT fire on phantom income — uncorroborated income can't clear the floor", () => {
    const r = evaluateRuling(input({
      appliedRentCents: 800_000, declaredMonthlyIncomeCents: 2_500_000, adults: 1, minorDependents: 0,
      reconciliation: recon({ observedObligationsCents: 0, declaredSources: [
        { source_key: "employment", label: "Employment (gross)", declared_monthly_cents: 2_500_000, evidenced_monthly_cents: null, variance_pct: null, match_confidence: 0, status: "uncorroborated", evidenceDocType: null },
      ] }),
    }))
    expect(r.affordability.tier).not.toBe("residual-override")  // corroborated income 0 → no override
  })
  it("more dependents raise the floor → override withheld when residual no longer clears it", () => {
    const base = marginalOver()
    const r = evaluateRuling({ ...base, minorDependents: 8 })  // floor = 3500 + 8*1750 = R17,500 > R16,000 residual
    expect(r.affordability.tier).not.toBe("residual-override")
  })
})

describe("evaluateRuling — corroborated (verified) income dual ratio", () => {
  it("sums evidenced across sources (uncorroborated counts 0) + computes the verified ratio", () => {
    const r = evaluateRuling(input({ appliedRentCents: 700_000, reconciliation: recon({ declaredSources: [
      { source_key: "employment", label: "Employment (gross)", declared_monthly_cents: 1_750_000, evidenced_monthly_cents: 2_460_000, variance_pct: -41, match_confidence: 0.6, status: "variance", evidenceDocType: "payslip" },
      { source_key: "rental", label: "Rental income", declared_monthly_cents: 500_000, evidenced_monthly_cents: null, variance_pct: null, match_confidence: 0, status: "uncorroborated", evidenceDocType: null },
    ] }) }))
    expect(r.affordability.corroboratedIncomeCents).toBe(2_460_000) // only the evidenced employment; rental counts 0
    expect(r.affordability.corroboratedRatioPct).toBe(28)           // 700000 / 2460000
  })
  it("no evidence → corroborated income 0, ratio null", () => {
    const r = evaluateRuling(input({ reconciliation: recon({ declaredSources: [
      { source_key: "employment", label: "Employment (gross)", declared_monthly_cents: 2_800_000, evidenced_monthly_cents: null, variance_pct: null, match_confidence: 0, status: "no-evidence", evidenceDocType: null },
    ] }) }))
    expect(r.affordability.corroboratedIncomeCents).toBe(0)
    expect(r.affordability.corroboratedRatioPct).toBeNull()
  })
})

describe("evaluateRuling — determinism + version stamp (POPIA s71 replay)", () => {
  it("stamps the ruling version on every result", () => {
    expect(evaluateRuling(input()).rulingVersion).toBe(RULING_VERSION)
    expect(RULING_VERSION).toBe("ruling.v3") // pin: bump deliberately when the logic changes, never silently
  })
  it("is deterministic — same input → identical output (replay defence)", () => {
    const inp = input({ appliedRentCents: 170_000, declaredMonthlyIncomeCents: 500_000, reconciliation: recon(lowCorrob(500_000)) })
    expect(evaluateRuling(inp)).toEqual(evaluateRuling(inp))
  })
})
