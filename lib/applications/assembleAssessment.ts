/**
 * lib/applications/assembleAssessment.ts — DB rows → freeAssessment inputs → verdict (the WIRING).
 *
 * Pure + deterministic: the submit route fetches the application + co-applicant rows + the primary's document
 * slots, then hands the plain shapes here to build the FreeApplicantInput set + company options and run the
 * Step-1 free assessment. Extracted from the route so the wiring itself is unit-testable (DB shape → verdict),
 * not just the engine in isolation — the gap that let a correct calculator stay unplugged.
 *
 * Notes:  Company applications pass the company as the PAYER (net profit ÷ 12 vs rent; turnover is context only),
 *         parsed from company_info.annual* (rands). Directors flagged is_surety_director (or role "guarantor")
 *         become the surety backstop. surety_group / marital_regime are honoured WHEN PRESENT (pooling + s15
 *         consent) — the columns aren't captured yet, so today they arrive undefined (standalone, no consent).
 */
import { freeAssessment, type FreeApplicantInput, type FreeAssessmentResult, type FreeAssessmentOptions, type DocSlot } from "@/lib/applications/freeAssessment"
import { isJuristicCompanyType } from "@/lib/applications/companyTypes"
import { companyAgeYears } from "@/lib/applications/docCategories"
import { decryptIdNumber, decryptDob } from "@/lib/crypto/idNumber"

export interface AssessmentAppRow {
  gross_monthly_income_cents?: number | null
  declared_monthly_obligations_cents?: number | null
  id_type?: string | null; id_number?: string | null; date_of_birth?: string | null
  employment_start_date?: string | null
  employment_details?: Record<string, unknown> | null
  documents_submitted?: boolean | null; bank_statement_path?: string | null
  applicant_type?: string | null
  company_info?: Record<string, unknown> | null
}
export interface AssessmentCoRow {
  role?: string | null; is_surety_director?: boolean | null
  gross_monthly_income_cents?: number | null; declared_monthly_obligations_cents?: number | null
  id_type?: string | null; id_number?: string | null; date_of_birth?: string | null
  documents_submitted?: boolean | null; stage1_consent_given?: boolean | null
  surety_group?: string | null; marital_regime?: string | null
}

/** Annual rands (a free-typed string like "2 400 000" / "R600,000", or a number) → monthly cents. null if absent/0. */
export function annualRandsToMonthlyCents(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round((n * 100) / 12)
}

/** A monthly rands figure (e.g. the company's existing commitments) → cents. Null when blank/non-positive. */
export function monthlyRandsToCents(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

// ── Cash-flow ledger (company finances) — sum {amount, period} rows to monthly cents ────────────────
const LEDGER_DIVISOR: Record<string, number> = { month: 1, quarter: 3, annual: 12 }
function ledgerLineMonthlyCents(r: unknown): number {
  const row = (r ?? {}) as { amount?: unknown; period?: unknown }
  const n = typeof row.amount === "number" ? row.amount : parseFloat(String(row.amount ?? "").replace(/[^\d.]/g, ""))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round((n * 100) / (LEDGER_DIVISOR[String(row.period ?? "month")] ?? 1))
}
export function ledgerMonthlyCents(rows: unknown): number {
  return Array.isArray(rows) ? rows.reduce((s: number, r) => s + ledgerLineMonthlyCents(r), 0) : 0
}
function ledgerKeyMonthlyCents(rows: unknown, key: string): number {
  return Array.isArray(rows) ? rows.filter((r) => (r as { key?: unknown })?.key === key).reduce((s: number, r) => s + ledgerLineMonthlyCents(r), 0) : 0
}

/** Build the freeAssessment company option from company_info: the CASH-FLOW LEDGER when present (surplus = Σin − Σout,
 *  turnover = Σin, debt + owner salary already netted in the out-lines), else the deprecated flat fields (fallback
 *  for resumed pre-ledger drafts). null for a non-juristic / non-company applicant. */
export function companyOptionFrom(ci: AssessmentAppRow["company_info"], applicantType: string | null | undefined): FreeAssessmentOptions["company"] {
  if (!(applicantType === "company" && ci && isJuristicCompanyType(ci.companyType))) return null
  const ageYears = companyAgeYears(ci.companyReg as string | null | undefined)
  const lin = ci.ledgerIn, lout = ci.ledgerOut
  const hasLedger = (Array.isArray(lin) && lin.length > 0) || (Array.isArray(lout) && lout.length > 0)
  if (hasLedger) {
    const turnover = ledgerMonthlyCents(lin)
    return {
      netProfitMonthlyCents: turnover - ledgerMonthlyCents(lout), // surplus is the affordability capacity
      turnoverMonthlyCents: turnover,
      monthlyCommitmentsCents: 0,                                 // out-lines already net it — don't double-subtract
      ownerCompMonthlyCents: ledgerKeyMonthlyCents(lout, "owner_remuneration"), // owner drawings ONLY — staff salaries stay out of the add-back
      premisesRentMonthlyCents: ledgerKeyMonthlyCents(lout, "premises_rent"),
      premisesMove: (ci.premisesMove as string | null) ?? null,
      figuresSource: (ci.figuresSource as string | null) ?? null,
      afsYear: (ci.afsYear as string | null) ?? null,
      ageYears,
    }
  }
  return { netProfitMonthlyCents: annualRandsToMonthlyCents(ci.annualProfit), turnoverMonthlyCents: annualRandsToMonthlyCents(ci.annualTurnover), monthlyCommitmentsCents: monthlyRandsToCents(ci.monthlyCommitments), ageYears }
}

export function assembleAssessment(p: Readonly<{
  rentCents: number
  depositCents: number | null
  leaseTermMonths: number | null
  app: AssessmentAppRow
  coRows: ReadonlyArray<AssessmentCoRow>
  primaryDocuments: DocSlot[]
  childMaintenanceCents: number
}>): FreeAssessmentResult {
  const applicants: FreeApplicantInput[] = [
    {
      role: "primary",
      declaredIncomeCents: p.app.gross_monthly_income_cents ?? 0,
      childMaintenanceCents: p.childMaintenanceCents,
      declaredObligationsCents: p.app.declared_monthly_obligations_cents ?? null,
      idType: p.app.id_type ?? null, idNumber: decryptIdNumber(p.app.id_number ?? null),
      declaredDob: decryptDob(p.app.date_of_birth ?? null),
      employmentStartDate: p.app.employment_start_date ?? null,
      contractEndDate: (p.app.employment_details?.contract_end_date as string | null) ?? null,
      documentsUploaded: p.app.documents_submitted === true || !!p.app.bank_statement_path,
      documents: p.primaryDocuments,
      complete: true,
    },
    ...p.coRows.map((c): FreeApplicantInput => ({
      role: c.role === "guarantor" || c.is_surety_director === true ? "guarantor" : "co_applicant",
      declaredIncomeCents: c.gross_monthly_income_cents ?? 0,
      declaredObligationsCents: c.declared_monthly_obligations_cents ?? null,
      idType: c.id_type ?? null, idNumber: decryptIdNumber(c.id_number ?? null),
      declaredDob: decryptDob(c.date_of_birth ?? null),
      documentsUploaded: c.documents_submitted === true,
      complete: c.stage1_consent_given === true,
      suretyGroup: c.surety_group ?? null,
      maritalRegime: (c.marital_regime as FreeApplicantInput["maritalRegime"]) ?? null,
    })),
  ]

  // Company = the PAYER only for a JURISTIC entity (cash-flow surplus vs rent; sole prop / partnership isn't a
  // separate legal person → no company payer, the owner's PERSONAL income carries it). See companyOptionFrom.
  const company = companyOptionFrom(p.app.company_info, p.app.applicant_type)

  return freeAssessment(p.rentCents, applicants, { depositCents: p.depositCents, leaseTermMonths: p.leaseTermMonths, company })
}
