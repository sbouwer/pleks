/**
 * lib/applications/__tests__/companyRuling.test.ts — ADDENDUM_14O Phase 0a (deep-scan company affordability).
 *
 * Verdict-asserting (outcomes, not helpers). The strict model: declared company figures are SIGNALS only — never
 * credited to affordability; the verified basis is the single lead-director residual read as a surety test.
 */
import { describe, it, expect } from "vitest"
import { evaluateCompanyRuling, COMPANY_RULING_VERSION, type CompanyOption } from "../companyRuling"
import { RULING_VERSION, type RulingInput, type RulingResult } from "../ruling"
import { companyOptionFrom } from "../assembleAssessment"
import type { ReconciliationResult } from "@/lib/extraction/types"

const NOW = new Date("2026-06-20T00:00:00Z")
const corrob = (cents: number): Partial<ReconciliationResult> => ({
  declaredSources: [{ source_key: "employment", label: "Employment (gross)", declared_monthly_cents: cents, evidenced_monthly_cents: cents, variance_pct: 0, match_confidence: 0.9, status: "corroborated", evidenceDocType: "payslip" }],
})
function recon(over: Partial<ReconciliationResult> = {}): ReconciliationResult {
  return {
    reconcilerVersion: "recon.v1",
    declaredSources: corrob(2_800_000).declaredSources!,
    housingPayment: { detected: false, recurring_monthly_cents: null, months_observed: 0, anyMissedOrReturned: false },
    netPayVsCredit: { payslip_net_cents: 1_900_000, bank_salary_credit_cents: 1_900_000, gap_pct: 0, verdict: "match" },
    identity: { name: "consistent", idNumber: "consistent" },
    recency: { oldestDocumentDate: "2026-03-31", newestDocumentDate: "2026-05-31", mostRecentWithinDays: 20, salariedMonthsCovered: 3, monthsCovered: ["2026-03", "2026-04", "2026-05"], consecutive: true },
    observedObligationsCents: null,
    ...over,
  }
}
// Lead director — adults:1 ALWAYS (the screen route scopes it so, §5.4; co-directors are separate households).
function lead(over: Partial<RulingInput> = {}): RulingInput {
  return { appliedRentCents: 700_000, declaredMonthlyIncomeCents: 2_800_000, employmentType: "permanent", employmentStartDate: "2020-01-01", reconciliation: recon(), now: NOW, adults: 1, ...over }
}
const co = (over: Partial<CompanyOption> = {}): CompanyOption => ({ netProfitMonthlyCents: 1_000_000, turnoverMonthlyCents: 5_000_000, ...over })
const flag = (r: RulingResult, id: number) => r.flags.find((f) => f.id === id)

describe("evaluateCompanyRuling — verified lead-director surety basis", () => {
  it("lead director's verified residual covers the rent → strong; declared-capacity flag present; surplus NOT credited", () => {
    const r = evaluateCompanyRuling({ leadDirector: lead(), company: co({ netProfitMonthlyCents: 1_000_000 }) })
    expect(r.rulingTier).toBe("strong")                                   // backsRent true, verified director carries it
    expect(flag(r, 90)).toBeTruthy()                                      // declared-capacity confidence flag (always)
    expect((r.affordability as Record<string, unknown>).netProfitMonthlyCents).toBeUndefined() // surplus is NOT in affordability
    expect(flag(r, 91)?.severity).toBe("positive")                       // declared surplus rides as a signal only
  })

  it("INVERSION: strong DECLARED surplus but the lead director's verified residual does NOT back the rent → not strong", () => {
    // Marginal director (residual < floor → backsRent false), but the company declares it affords + Step-1 said strong.
    const r = evaluateCompanyRuling({
      leadDirector: lead({ appliedRentCents: 170_000, declaredMonthlyIncomeCents: 500_000, reconciliation: recon(corrob(500_000)) }),
      company: co({ netProfitMonthlyCents: 400_000 }), companyVerdict: "strong",
    })
    expect(["needs-evidence", "below-threshold"]).toContain(r.rulingTier)  // capped — declared company claim never lifts
    expect(r.rulingTier).not.toBe("strong")
    expect(r.rulingTier).not.toBe("adequate")
    expect(flag(r, 91)?.severity).toBe("minor")                          // the inversion signal (request bank/AFS evidence)
  })

  it("relocate + declared premises ≥ rent → flag 9 (signal/positive); does NOT lift the tier", () => {
    const r = evaluateCompanyRuling({ leadDirector: lead(), company: co({ premisesMove: "relocate", premisesRentMonthlyCents: 800_000 }) })
    expect(flag(r, 9)?.type).toBe("signal")
    expect(flag(r, 9)?.severity).toBe("positive")
    expect(r.rulingTier).toBe("strong")                                   // unchanged by the signal (carried by the director)
  })

  it("additional premises (not relocating) → NO flag 9 (would over-credit a second-premises company)", () => {
    const r = evaluateCompanyRuling({ leadDirector: lead(), company: co({ premisesMove: "additional", premisesRentMonthlyCents: 800_000 }) })
    expect(flag(r, 9)).toBeUndefined()
  })

  it("owner-managed: thin surplus rescued by OWNER remuneration → flag 92; STAFF-driven thin surplus does not", () => {
    const ownerDriven = evaluateCompanyRuling({ leadDirector: lead(), company: co({ netProfitMonthlyCents: 100_000, ownerCompMonthlyCents: 700_000 }) })
    expect(flag(ownerDriven, 92)).toBeTruthy()                           // 100k surplus + 700k owner draw ≥ 700k rent
    const staffDriven = evaluateCompanyRuling({ leadDirector: lead(), company: co({ netProfitMonthlyCents: 100_000, ownerCompMonthlyCents: 20_000 }) })
    expect(flag(staffDriven, 92)).toBeUndefined()                        // thin surplus is staff payroll, not drawings
  })

  it("determinism + composite version stamp", () => {
    const args = { leadDirector: lead(), company: co() }
    expect(evaluateCompanyRuling(args)).toEqual(evaluateCompanyRuling(args))
    expect(evaluateCompanyRuling(args).rulingVersion).toBe(`${COMPANY_RULING_VERSION}+${RULING_VERSION}`)
  })

  it("non-juristic applicant → companyOptionFrom is null → the screen route stays on the personal path", () => {
    expect(companyOptionFrom({ companyType: "sole_prop" }, "company")).toBeNull()
    expect(companyOptionFrom(null, "individual")).toBeNull()
  })
})
