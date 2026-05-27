/**
 * scripts/extraction-harness/lib/redactor.ts — POPIA-safe extraction transformer
 *
 * Transforms full DocumentExtraction (with PII) into harness-safe variants
 * per §4.5 data minimisation rules before any write to disk.
 *
 * Production output (going to the applications table) retains full values.
 * Harness output retains structural signals only: amounts, dates, categories.
 * Identity fields (names, ID numbers, addresses) are reduced to fragments.
 *
 * Spec: ADDENDUM_14L §4.5, D-14L-04, D-14L-05
 */
import type {
  DocumentExtraction,
  IDExtraction,
  PayslipExtraction,
  BankStatementExtraction,
  EmployerLetterExtraction,
  ProofOfAddressExtraction,
} from "../../../lib/extraction/types"

// ─── Employer categorisation ──────────────────────────────────────────────────

type EmployerCategory = "large-retailer" | "small-business" | "government" | "self-employed" | "other"

const GOVT_KEYWORDS    = ["government", "department", "municipality", "municipal", "saps", "sandf", "sars", "provincial", "national", "city of", "metro", "dept", "parliament", "commission", "authority", "public service", "department of"]
const LARGE_KEYWORDS   = ["woolworths", "pick n pay", "checkers", "shoprite", "spar", "edgars", "mr price", "truworths", "foschini", "pep", "ackermans", "game", "makro", "builders", "dis-chem", "clicks", "capitec", "fnb", "nedbank", "absa", "standard bank", "investec", "discovery", "old mutual", "sanlam", "liberty", "vodacom", "mtn", "telkom", "cell c", "sasol", "bidvest", "imperial", "tiger brands", "massmart"]
const SELF_KEYWORDS    = ["self-employed", "self employed", "freelance", "own account", "sole proprietor"]

function categorizeEmployer(name: string | null): EmployerCategory {
  if (!name) return "other"
  const lower = name.toLowerCase()
  if (SELF_KEYWORDS.some(k => lower.includes(k)))  return "self-employed"
  if (GOVT_KEYWORDS.some(k => lower.includes(k)))  return "government"
  if (LARGE_KEYWORDS.some(k => lower.includes(k))) return "large-retailer"
  if (lower.includes(" cc") || lower.includes("(pty)") || lower.includes(" pty") || lower.includes(" ltd") || lower.includes("trading as")) return "small-business"
  return "other"
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function redactName(name: string | null): { length: number; firstInitial: string } | null {
  if (!name) return null
  const t = name.trim()
  return { length: t.length, firstInitial: t.charAt(0).toUpperCase() }
}

function last4(s: string | null): string | null {
  if (!s) return null
  return s.length >= 4 ? s.slice(-4) : s
}

// ─── Harness-safe extraction types ───────────────────────────────────────────

export interface HarnessIDExtraction {
  document_type:        IDExtraction["document_type"]
  full_name:            { length: number; firstInitial: string } | null
  id_number_last4:      string | null
  date_of_birth:        string | null
  gender:               "M" | "F" | null
  citizenship:          "SA" | "non-SA" | null
  expiry_date:          string | null
  extraction_confidence: number
}

export interface HarnessPayslipExtraction {
  employer_category:    EmployerCategory
  employee_name:        { length: number; firstInitial: string } | null
  pay_period:           string | null
  language:             "en" | "af" | "mixed"
  gross_pay_cents:      number | null
  net_pay_cents:        number | null
  deductions:           Array<{ label: string; amount_cents: number }>
  ytd_gross_cents:      number | null
  ytd_paye_cents:       number | null
  payment_method:       PayslipExtraction["payment_method"]
  bank_account_last4:   string | null
  extraction_confidence: number
}

export interface HarnessBankStatementExtraction {
  bank:                  BankStatementExtraction["bank"]
  account_number_last4:  string | null
  account_type:          BankStatementExtraction["account_type"]
  statement_period_from: string | null
  statement_period_to:   string | null
  opening_balance_cents: number | null
  closing_balance_cents: number | null
  inflows:               BankStatementExtraction["inflows"]
  outflows:              BankStatementExtraction["outflows"]
  income_indicators:     BankStatementExtraction["income_indicators"]
  extraction_confidence: number
}

export interface HarnessEmployerLetterExtraction {
  employer_category:          EmployerCategory
  employer_address:           null
  employer_contact:           null
  employee_name:              { length: number; firstInitial: string } | null
  employment_start_date:      string | null
  employment_type:            EmployerLetterExtraction["employment_type"]
  job_title:                  string | null
  gross_monthly_salary_cents: number | null
  net_monthly_salary_cents:   number | null
  signed:                     boolean
  letter_date:                string | null
  extraction_confidence:      number
}

export interface HarnessProofOfAddressExtraction {
  document_subtype:     ProofOfAddressExtraction["document_subtype"]
  full_name:            { length: number; firstInitial: string } | null
  address_line1:        null
  suburb:               string | null
  city:                 string | null
  province:             string | null
  postal_code:          string | null
  document_date:        string | null
  issuer:               string | null
  extraction_confidence: number
}

export type HarnessDocumentExtraction =
  | HarnessIDExtraction
  | HarnessPayslipExtraction
  | HarnessBankStatementExtraction
  | HarnessEmployerLetterExtraction
  | HarnessProofOfAddressExtraction
  | null

// ─── Per-type redactors ───────────────────────────────────────────────────────

function redactId(e: IDExtraction): HarnessIDExtraction {
  return {
    document_type:        e.document_type,
    full_name:            redactName(e.full_name),
    id_number_last4:      last4(e.id_number),
    date_of_birth:        e.date_of_birth,
    gender:               e.gender,
    citizenship:          e.citizenship,
    expiry_date:          e.expiry_date,
    extraction_confidence: e.extraction_confidence,
  }
}

function redactPayslip(e: PayslipExtraction): HarnessPayslipExtraction {
  return {
    employer_category:    categorizeEmployer(e.employer_name),
    employee_name:        redactName(e.employee_name),
    pay_period:           e.pay_period,
    language:             e.language,
    gross_pay_cents:      e.gross_pay_cents,
    net_pay_cents:        e.net_pay_cents,
    deductions:           e.deductions,
    ytd_gross_cents:      e.ytd_gross_cents,
    ytd_paye_cents:       e.ytd_paye_cents,
    payment_method:       e.payment_method,
    bank_account_last4:   e.bank_account_last4,
    extraction_confidence: e.extraction_confidence,
  }
}

function redactBankStatement(e: BankStatementExtraction): HarnessBankStatementExtraction {
  return {
    bank:                  e.bank,
    account_number_last4:  e.account_number_last4,
    account_type:          e.account_type,
    statement_period_from: e.statement_period_from,
    statement_period_to:   e.statement_period_to,
    opening_balance_cents: e.opening_balance_cents,
    closing_balance_cents: e.closing_balance_cents,
    inflows:               e.inflows,
    outflows:              e.outflows,
    income_indicators:     e.income_indicators,
    extraction_confidence: e.extraction_confidence,
  }
}

function redactEmployerLetter(e: EmployerLetterExtraction): HarnessEmployerLetterExtraction {
  return {
    employer_category:          categorizeEmployer(e.employer_name),
    employer_address:           null,
    employer_contact:           null,
    employee_name:              redactName(e.employee_name),
    employment_start_date:      e.employment_start_date,
    employment_type:            e.employment_type,
    job_title:                  e.job_title,
    gross_monthly_salary_cents: e.gross_monthly_salary_cents,
    net_monthly_salary_cents:   e.net_monthly_salary_cents,
    signed:                     e.signed,
    letter_date:                e.letter_date,
    extraction_confidence:      e.extraction_confidence,
  }
}

function redactProofOfAddress(e: ProofOfAddressExtraction): HarnessProofOfAddressExtraction {
  return {
    document_subtype:     e.document_subtype,
    full_name:            redactName(e.full_name),
    address_line1:        null,
    suburb:               e.suburb,
    city:                 e.city,
    province:             e.province,
    postal_code:          e.postal_code,
    document_date:        e.document_date,
    issuer:               e.issuer,
    extraction_confidence: e.extraction_confidence,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function redactExtraction(docType: string | undefined, extraction: DocumentExtraction): HarnessDocumentExtraction {
  if (!extraction) return null
  switch (docType) {
    case "id-document":      return redactId(extraction as IDExtraction)
    case "payslip":          return redactPayslip(extraction as PayslipExtraction)
    case "bank-statement":   return redactBankStatement(extraction as BankStatementExtraction)
    case "employer-letter":  return redactEmployerLetter(extraction as EmployerLetterExtraction)
    case "proof-of-address": return redactProofOfAddress(extraction as ProofOfAddressExtraction)
    default:                 return null
  }
}
