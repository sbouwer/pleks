/**
 * lib/applications/__tests__/companyRuling.test.ts — ADDENDUM_14O/14P (deep-scan company affordability).
 *
 * Verdict-asserting (outcomes, not helpers). Strict model: declared company figures are SIGNALS only — never
 * credited; the verified basis is the directors' surety POOL (0b) read as capacity vs rent. Living floor = R3 500/adult.
 */
import { describe, it, expect } from "vitest"
import { evaluateCompanyRuling, COMPANY_RULING_VERSION, type CompanyOption, type DirectorSurety } from "../companyRuling"
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
// A director's personal ruling input — adults:1 ALWAYS (§5.4; co-directors are separate households). income is the
// corroborated figure (drives capacity = income − rent − obl, +rent − floor = income − floor here, obl 0, floor 350k).
function din(income: number, over: Partial<RulingInput> = {}): RulingInput {
  return { appliedRentCents: 700_000, declaredMonthlyIncomeCents: income, employmentType: "permanent", employmentStartDate: "2020-01-01", reconciliation: recon(corrob(income)), now: NOW, adults: 1, ...over }
}
function director(input: RulingInput, over: Partial<DirectorSurety> = {}): DirectorSurety {
  return { ref: "primary", input, suretyState: "intended", consented: true, ...over }
}
const co = (over: Partial<CompanyOption> = {}): CompanyOption => ({ netProfitMonthlyCents: 1_000_000, turnoverMonthlyCents: 5_000_000, ...over })
const flag = (r: RulingResult, id: number) => r.flags.find((f) => f.id === id)

describe("evaluateCompanyRuling — single director (0a parity)", () => {
  it("verified residual covers the rent → strong; declared-capacity flag; surplus NOT credited; surety pool flag", () => {
    const r = evaluateCompanyRuling({ directors: [director(din(2_800_000))], company: co() })
    expect(r.rulingTier).toBe("strong")                                   // capacity 2.45m ≥ 700k → backs
    expect(flag(r, 90)).toBeTruthy()                                      // declared-capacity (always)
    expect((r.affordability as Record<string, unknown>).netProfitMonthlyCents).toBeUndefined()
    expect(flag(r, 91)?.severity).toBe("positive")                       // declared surplus rides as a signal
    expect(flag(r, 95)?.severity).toBe("positive")                       // surety pool backs
  })

  it("INVERSION: strong DECLARED surplus but the director's verified residual does NOT back → not strong", () => {
    const r = evaluateCompanyRuling({
      directors: [director(din(500_000, { appliedRentCents: 170_000 }))],   // residual 330k < floor 350k → no back
      company: co({ netProfitMonthlyCents: 400_000 }), companyVerdict: "strong",
    })
    expect(["needs-evidence", "below-threshold"]).toContain(r.rulingTier)
    expect(r.rulingTier).not.toBe("strong")
    expect(flag(r, 91)?.severity).toBe("minor")                          // inversion signal
  })

  it("relocate + declared premises ≥ rent → flag 9 signal/positive; does NOT lift the tier", () => {
    const r = evaluateCompanyRuling({ directors: [director(din(2_800_000))], company: co({ premisesMove: "relocate", premisesRentMonthlyCents: 800_000 }) })
    expect(flag(r, 9)?.type).toBe("signal")
    expect(flag(r, 9)?.severity).toBe("positive")
    expect(r.rulingTier).toBe("strong")
  })
  it("additional premises → NO flag 9", () => {
    const r = evaluateCompanyRuling({ directors: [director(din(2_800_000))], company: co({ premisesMove: "additional", premisesRentMonthlyCents: 800_000 }) })
    expect(flag(r, 9)).toBeUndefined()
  })

  it("owner-managed: thin surplus rescued by OWNER remuneration → flag 92; STAFF-driven does not", () => {
    expect(flag(evaluateCompanyRuling({ directors: [director(din(2_800_000))], company: co({ netProfitMonthlyCents: 100_000, ownerCompMonthlyCents: 700_000 }) }), 92)).toBeTruthy()
    expect(flag(evaluateCompanyRuling({ directors: [director(din(2_800_000))], company: co({ netProfitMonthlyCents: 100_000, ownerCompMonthlyCents: 20_000 }) }), 92)).toBeUndefined()
  })

  it("determinism + composite 0b version", () => {
    const args = { directors: [director(din(2_800_000))], company: co() }
    expect(evaluateCompanyRuling(args)).toEqual(evaluateCompanyRuling(args))
    expect(evaluateCompanyRuling(args).rulingVersion).toBe(`${COMPANY_RULING_VERSION}+${RULING_VERSION}`)
    expect(COMPANY_RULING_VERSION).toBe("company-ruling.v0b")
  })

  it("non-juristic → companyOptionFrom null → personal path", () => {
    expect(companyOptionFrom({ companyType: "sole_prop" }, "company")).toBeNull()
    expect(companyOptionFrom(null, "individual")).toBeNull()
  })
})

describe("evaluateCompanyRuling 0b — director pool, policy + surety state", () => {
  // Two directors @ R800k income each → capacity 450k each (income − floor 350k). Each alone < 700k rent; combined 900k ≥ 700k.
  const twoMarginal = (state: "intended" | "executed") => [director(din(800_000), { ref: "primary", suretyState: state }), director(din(800_000), { ref: "co_x", suretyState: state })]

  it("§7.7 the dispositive policy selects the aggregation (post-execution) — same residuals, different verdict", () => {
    const single = evaluateCompanyRuling({ directors: twoMarginal("executed"), company: co(), poolingRule: "strongestSingle" })
    const combined = evaluateCompanyRuling({ directors: twoMarginal("executed"), company: co(), poolingRule: "combined" })
    expect(single.rulingTier).toBe("below-threshold")        // strongest single 450k < 700k → not backed
    expect(["adequate", "strong"]).toContain(combined.rulingTier) // combined 900k ≥ 700k → backed
  })

  it("§7.2 pool covers where the lead alone doesn't (combined, executed)", () => {
    const r = evaluateCompanyRuling({ directors: twoMarginal("executed"), company: co(), poolingRule: "combined" })
    expect(r.rulingTier).not.toBe("below-threshold")
    expect(flag(r, 95)?.severity).toBe("positive")           // the pool backs
  })

  it("§10 combined is GATED on execution — INTENDED sureties collapse to strongestSingle (no unexecuted pooling)", () => {
    const intended = evaluateCompanyRuling({ directors: twoMarginal("intended"), company: co(), poolingRule: "combined" })
    expect(intended.rulingTier).toBe("below-threshold")      // configured combined deferred → strongest single 450k < 700k
    expect(flag(intended, 95)?.title).toMatch(/once all sureties are executed/i)
    const executed = evaluateCompanyRuling({ directors: twoMarginal("executed"), company: co(), poolingRule: "combined" })
    expect(["adequate", "strong"]).toContain(executed.rulingTier) // executed → combined applies → backed
  })

  it("§7.3 strict continuity: an unconsented surety director is a declared signal, NOT credited", () => {
    // Lead backs alone (2.8m); a second director with NO consent must not change the verified pool, and surfaces flag 97.
    const r = evaluateCompanyRuling({ directors: [director(din(2_800_000)), director(din(2_800_000), { ref: "co_y", consented: false })], company: co(), poolingRule: "combined" })
    expect(flag(r, 97)).toBeTruthy()                          // 1 declared-only surety director
    expect(r.rulingTier).toBe("strong")                      // carried by the verified lead alone
  })

  it("§7.8 surety state: none → not credited; intended → contingent; executed → not contingent", () => {
    const intended = evaluateCompanyRuling({ directors: [director(din(2_800_000), { suretyState: "intended" })], company: co() })
    expect(intended.rulingTier).toBe("strong")
    expect(flag(intended, 96)).toBeTruthy()                  // contingent — unexecuted instrument
    const executed = evaluateCompanyRuling({ directors: [director(din(2_800_000), { suretyState: "executed" })], company: co() })
    expect(executed.rulingTier).toBe("strong")
    expect(flag(executed, 96)).toBeUndefined()               // executed → active, not contingent
    const none = evaluateCompanyRuling({ directors: [director(din(2_800_000), { suretyState: "none" })], company: co() })
    expect(none.rulingTier).not.toBe("strong")               // not standing surety → not credited
  })
})
