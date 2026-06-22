/**
 * lib/extraction/__tests__/reconciler.test.ts — the deterministic reconciler (ADDENDUM_14L Phase 3)
 *
 * Pins the Confidence-axis facts 14M rules over: declared-source corroboration (flags 5/6), the
 * demonstrated-housing-payment override (flag 0), net-pay-vs-credit (flag 8), identity consistency (flag 7),
 * and recency/consecutiveness (flags 3/4). Determinism is the point (FitScore replay) — `now` is injected.
 */
import { describe, it, expect } from "vitest"
import { reconcile } from "../reconciler"
import type {
  PipelineDocumentResult, DeclaredContext,
  PayslipExtraction, BankStatementExtraction, IDExtraction, EmployerLetterExtraction,
} from "../types"

const NOW = new Date("2026-06-20T00:00:00Z")

function res(documentType: string, extracted: object): PipelineDocumentResult {
  return { filename: `${documentType}.pdf`, path: `/${documentType}`, status: "classified", documentType, extracted: extracted as never, extractionConfidence: (extracted as { extraction_confidence?: number }).extraction_confidence ?? 0.95 }
}
function payslip(p: Partial<PayslipExtraction>): PayslipExtraction {
  return { employer_name: "Acme", employee_name: "John Smith", pay_period: "2026-05", language: "en", gross_pay_cents: 2_500_000, net_pay_cents: 1_900_000, deductions: [], ytd_gross_cents: null, ytd_paye_cents: null, payment_method: "eft", bank_account_last4: null, extraction_confidence: 0.95, ...p }
}
function bank(p: Partial<BankStatementExtraction>): BankStatementExtraction {
  return { bank: "FNB", account_number_last4: null, account_type: "cheque", statement_period_from: "2026-03-01", statement_period_to: "2026-05-31", opening_balance_cents: 0, closing_balance_cents: 0, inflows: [], outflows: [], income_indicators: { regular_salary_detected: false, average_monthly_inflow_cents: null, debit_order_volume_cents: null, end_of_month_dip_detected: false }, extraction_confidence: 0.95, ...p }
}
function id(p: Partial<IDExtraction>): IDExtraction {
  return { document_type: "sa-smart-id", full_name: "John Smith", id_number: "9001015800087", date_of_birth: null, gender: null, citizenship: null, expiry_date: null, extraction_confidence: 0.95, ...p }
}
const declared = (over: Partial<DeclaredContext> = {}): DeclaredContext => ({
  applicant: { fullName: "John Smith", idNumber: "9001015800087" },
  incomeSources: [{ key: "employment", label: "Employment (gross)", monthly_cents: 2_500_000 }],
  ...over,
})

describe("reconcile — declared income sources (flags 5/6)", () => {
  it("corroborates employment when payslip gross matches declared", () => {
    const r = reconcile([res("payslip", payslip({ gross_pay_cents: 2_500_000 }))], declared(), NOW)
    expect(r.declaredSources[0]).toMatchObject({ source_key: "employment", status: "corroborated", evidenced_monthly_cents: 2_500_000, evidenceDocType: "payslip" })
  })
  it("flags variance when evidence is materially below declared", () => {
    const r = reconcile([res("payslip", payslip({ gross_pay_cents: 2_000_000 }))], declared(), NOW)
    expect(r.declaredSources[0].status).toBe("variance")
    expect(r.declaredSources[0].variance_pct).toBe(20)
  })
  it("uses the payslip ahead of the employer letter (precedence)", () => {
    const letter: Partial<EmployerLetterExtraction> = { gross_monthly_salary_cents: 9_999_999 }
    const r = reconcile([res("employer-letter", { ...letter, employment_type: "permanent", signed: true, extraction_confidence: 0.9 }), res("payslip", payslip({ gross_pay_cents: 2_500_000 }))], declared(), NOW)
    expect(r.declaredSources[0].evidenceDocType).toBe("payslip")
  })
  it("uncorroborated when a declared source has no matching evidence (→ flag 5, never a guess)", () => {
    const d = declared({ incomeSources: [{ key: "rental", label: "Rental income", monthly_cents: 500_000 }] })
    const r = reconcile([res("payslip", payslip({}))], d, NOW)
    expect(r.declaredSources[0].status).toBe("uncorroborated")
    expect(r.declaredSources[0].evidenced_monthly_cents).toBeNull()
  })
  it("no-evidence when nothing was uploaded at all", () => {
    const r = reconcile([], declared(), NOW)
    expect(r.declaredSources[0].status).toBe("no-evidence")
  })
  it("corroborates rental from a recurring inflow across ≥2 months", () => {
    const d = declared({ incomeSources: [{ key: "rental", label: "Rental income", monthly_cents: 500_000 }] })
    const b = bank({ inflows: [
      { date: "2026-03-15", amount_cents: 500_000, counterparty_category: "rental-deposit", counterparty_label: "deposit" },
      { date: "2026-04-15", amount_cents: 500_000, counterparty_category: "rental-deposit", counterparty_label: "deposit" },
    ] })
    const r = reconcile([res("bank-statement", b)], d, NOW)
    expect(r.declaredSources[0].status).toBe("corroborated")
    expect(r.declaredSources[0].evidenceDocType).toBe("bank-statement")
  })
  it("guards variance_pct against a zero declared amount (no divide-by-zero)", () => {
    const d = declared({ incomeSources: [{ key: "employment", label: "Employment (gross)", monthly_cents: 0 }] })
    const r = reconcile([res("payslip", payslip({ gross_pay_cents: 2_500_000 }))], d, NOW)
    expect(r.declaredSources[0].variance_pct).toBeNull()
  })
})

describe("reconcile — demonstrated housing payment (flag 0)", () => {
  it("detects a recurring rent/home-loan outflow + its monthly amount", () => {
    const b = bank({ statement_period_from: "2026-03-01", statement_period_to: "2026-05-31", outflows: [
      { date: "2026-03-01", amount_cents: 800_000, counterparty_category: "rent", counterparty_label: "monthly rent" },
      { date: "2026-04-01", amount_cents: 800_000, counterparty_category: "home-loan", counterparty_label: "bond" },
      { date: "2026-05-01", amount_cents: 800_000, counterparty_category: "rent", counterparty_label: "monthly rent" },
    ] })
    const r = reconcile([res("bank-statement", b)], declared(), NOW)
    expect(r.housingPayment).toMatchObject({ detected: true, recurring_monthly_cents: 800_000, months_observed: 3, anyMissedOrReturned: false })
  })
  it("flags a skipped month inside the span (anyMissedOrReturned)", () => {
    const b = bank({ outflows: [
      { date: "2026-01-01", amount_cents: 800_000, counterparty_category: "rent", counterparty_label: "rent" },
      { date: "2026-03-01", amount_cents: 800_000, counterparty_category: "rent", counterparty_label: "rent" },
    ] })
    const r = reconcile([res("bank-statement", b)], declared(), NOW)
    expect(r.housingPayment.anyMissedOrReturned).toBe(true)
  })
})

describe("reconcile — net pay vs salary credit (flag 8)", () => {
  it("matches when the salary credit ≈ payslip net", () => {
    const b = bank({ inflows: [{ date: "2026-05-25", amount_cents: 1_900_000, counterparty_category: "salary", counterparty_label: "salary" }] })
    const r = reconcile([res("payslip", payslip({ net_pay_cents: 1_900_000 })), res("bank-statement", b)], declared(), NOW)
    expect(r.netPayVsCredit.verdict).toBe("match")
  })
  it("flags a gap when the credit is materially below net (garnishee / other account)", () => {
    const b = bank({ inflows: [{ date: "2026-05-25", amount_cents: 1_500_000, counterparty_category: "salary", counterparty_label: "salary" }] })
    const r = reconcile([res("payslip", payslip({ net_pay_cents: 1_900_000 })), res("bank-statement", b)], declared(), NOW)
    expect(r.netPayVsCredit.verdict).toBe("gap")
  })
})

describe("reconcile — identity (flag 7)", () => {
  it("material-mismatch on a different name", () => {
    const r = reconcile([res("id-document", id({ full_name: "John Smith" })), res("payslip", payslip({ employee_name: "Jane Jones" }))], declared(), NOW)
    expect(r.identity.name).toBe("material-mismatch")
  })
  it("minor-variation for initials-vs-full same surname", () => {
    const r = reconcile([res("id-document", id({ full_name: "John Smith" })), res("payslip", payslip({ employee_name: "J Smith" }))], declared(), NOW)
    expect(r.identity.name).toBe("minor-variation")
  })
  it("mismatch when ID numbers disagree", () => {
    const d = declared({ applicant: { fullName: "John Smith", idNumber: "9001015800099" } })
    const r = reconcile([res("id-document", id({ id_number: "9001015800087" }))], d, NOW)
    expect(r.identity.idNumber).toBe("mismatch")
  })
})

describe("reconcile — recency + consecutiveness (flags 3/4)", () => {
  it("reports days-since-newest and a consecutive month run", () => {
    const r = reconcile([res("bank-statement", bank({ statement_period_from: "2026-03-01", statement_period_to: "2026-05-31" }))], declared(), NOW)
    expect(r.recency.mostRecentWithinDays).toBe(20)            // 2026-05-31 → 2026-06-20
    expect(r.recency.monthsCovered).toEqual(["2026-03", "2026-04", "2026-05"])
    expect(r.recency.consecutive).toBe(true)
  })
  it("flags a non-consecutive month set", () => {
    const r = reconcile([
      res("payslip", payslip({ pay_period: "2026-01" })),
      res("bank-statement", bank({ statement_period_from: "2026-03-01", statement_period_to: "2026-04-30" })),
    ], declared(), NOW)
    expect(r.recency.consecutive).toBe(false)                  // Jan, Mar, Apr — Feb missing
  })
})
