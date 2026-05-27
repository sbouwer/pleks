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
  IRP5Extraction,
  UI19Extraction,
  NoticeOfAssessmentExtraction,
  ProxyLetterExtraction,
  DisclosrExtraction,
  DonationDeclarationExtraction,
  MotivationLetterExtraction,
  RecommendationLetterExtraction,
  SalaryIncreaseLetterExtraction,
  SarsIncomeTaxReferenceExtraction,
  SarsVatReferenceExtraction,
  SavingsAccountDetailsExtraction,
  CreditBureauReportExtraction,
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

// ─── Phase 2b harness-safe types ─────────────────────────────────────────────

export interface HarnessIRP5Extraction {
  employer_category:        EmployerCategory
  employee_name:            { length: number; firstInitial: string } | null
  tax_year:                 string | null
  gross_remuneration_cents: number | null
  paye_deducted_cents:      number | null
  uif_employee_cents:       number | null
  income_tax_number_last4:  string | null
  extraction_confidence:    number
}

export interface HarnessUI19Extraction {
  employee_name:             { length: number; firstInitial: string } | null
  employer_category:         EmployerCategory
  date_of_termination:       string | null
  reason_for_termination:    UI19Extraction["reason_for_termination"]
  last_monthly_salary_cents: number | null
  extraction_confidence:     number
}

export interface HarnessNoticeOfAssessmentExtraction {
  tax_year:               string | null
  assessment_date:        string | null
  taxable_income_cents:   number | null
  tax_payable_cents:      number | null
  income_tax_number_last4: string | null
  extraction_confidence:  number
}

export interface HarnessProxyLetterExtraction {
  company_name:              string | null
  authorising_director_name: { length: number; firstInitial: string } | null
  proxy_name:                { length: number; firstInitial: string } | null
  scope:                     string | null
  letter_date:               string | null
  signed:                    boolean
  extraction_confidence:     number
}

export interface HarnessDisclosrExtraction {
  applicant_name:            { length: number; firstInitial: string } | null
  disclosure_date:           string | null
  monthly_obligations_cents: number | null
  signed:                    boolean
  extraction_confidence:     number
}

export interface HarnessDonationDeclarationExtraction {
  donor_name:        { length: number; firstInitial: string } | null
  donor_relationship: string | null
  recipient_name:    { length: number; firstInitial: string } | null
  amount_cents:      number | null
  purpose:           string | null
  declaration_date:  string | null
  signed:            boolean
  extraction_confidence: number
}

export interface HarnessMotivationLetterExtraction {
  applicant_name:           { length: number; firstInitial: string } | null
  stated_reason_for_moving: string | null
  pets_mentioned:           boolean
  employment_mentioned:     boolean
  references_mentioned:     boolean
  letter_date:              string | null
  word_count:               number | null
  extraction_confidence:    number
}

export interface HarnessRecommendationLetterExtraction {
  recommender_name:         { length: number; firstInitial: string } | null
  recommender_relationship: RecommendationLetterExtraction["recommender_relationship"]
  subject_name:             { length: number; firstInitial: string } | null
  sentiment:                RecommendationLetterExtraction["sentiment"]
  payment_conduct_mentioned: boolean
  letter_date:              string | null
  signed:                   boolean
  extraction_confidence:    number
}

export interface HarnessSalaryIncreaseLetterExtraction {
  employer_category:            EmployerCategory
  employee_name:                { length: number; firstInitial: string } | null
  current_gross_monthly_cents:  number | null
  new_gross_monthly_cents:      number | null
  effective_date:               string | null
  letter_date:                  string | null
  signed:                       boolean
  extraction_confidence:        number
}

export interface HarnessSarsIncomeTaxReferenceExtraction {
  taxpayer_name:          { length: number; firstInitial: string } | null
  income_tax_number_last4: string | null
  issue_date:             string | null
  extraction_confidence:  number
}

export interface HarnessSarsVatReferenceExtraction {
  entity_name:       string | null   // company name — not personal
  vat_number_last6:  string | null
  registration_date: string | null
  extraction_confidence: number
}

export interface HarnessSavingsAccountDetailsExtraction {
  bank:                  SavingsAccountDetailsExtraction["bank"]
  account_number_last4:  string | null
  account_type:          SavingsAccountDetailsExtraction["account_type"]
  balance_cents:         number | null
  balance_date:          string | null
  extraction_confidence: number
}

export interface HarnessCreditBureauReportExtraction {
  subject_name:                   { length: number; firstInitial: string } | null
  report_date:                    string | null
  credit_score:                   number | null
  total_accounts:                 number | null
  accounts_in_arrears:            number | null
  adverse_listings:               number | null
  total_monthly_obligations_cents: number | null
  bureau:                         CreditBureauReportExtraction["bureau"]
  extraction_confidence:          number
}

export type HarnessDocumentExtraction =
  | HarnessIDExtraction
  | HarnessPayslipExtraction
  | HarnessBankStatementExtraction
  | HarnessEmployerLetterExtraction
  | HarnessProofOfAddressExtraction
  | HarnessIRP5Extraction
  | HarnessUI19Extraction
  | HarnessNoticeOfAssessmentExtraction
  | HarnessProxyLetterExtraction
  | HarnessDisclosrExtraction
  | HarnessDonationDeclarationExtraction
  | HarnessMotivationLetterExtraction
  | HarnessRecommendationLetterExtraction
  | HarnessSalaryIncreaseLetterExtraction
  | HarnessSarsIncomeTaxReferenceExtraction
  | HarnessSarsVatReferenceExtraction
  | HarnessSavingsAccountDetailsExtraction
  | HarnessCreditBureauReportExtraction
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

function redactIRP5(e: IRP5Extraction): HarnessIRP5Extraction {
  return {
    employer_category:        categorizeEmployer(e.employer_name),
    employee_name:            redactName(e.employee_name),
    tax_year:                 e.tax_year,
    gross_remuneration_cents: e.gross_remuneration_cents,
    paye_deducted_cents:      e.paye_deducted_cents,
    uif_employee_cents:       e.uif_employee_cents,
    income_tax_number_last4:  last4(e.income_tax_number),
    extraction_confidence:    e.extraction_confidence,
  }
}

function redactUI19(e: UI19Extraction): HarnessUI19Extraction {
  return {
    employee_name:             redactName(e.employee_name),
    employer_category:         categorizeEmployer(e.employer_name),
    date_of_termination:       e.date_of_termination,
    reason_for_termination:    e.reason_for_termination,
    last_monthly_salary_cents: e.last_monthly_salary_cents,
    extraction_confidence:     e.extraction_confidence,
  }
}

function redactNoticeOfAssessment(e: NoticeOfAssessmentExtraction): HarnessNoticeOfAssessmentExtraction {
  return {
    tax_year:                e.tax_year,
    assessment_date:         e.assessment_date,
    taxable_income_cents:    e.taxable_income_cents,
    tax_payable_cents:       e.tax_payable_cents,
    income_tax_number_last4: last4(e.income_tax_number),
    extraction_confidence:   e.extraction_confidence,
  }
}

function redactProxyLetter(e: ProxyLetterExtraction): HarnessProxyLetterExtraction {
  return {
    company_name:              e.company_name,
    authorising_director_name: redactName(e.authorising_director_name),
    proxy_name:                redactName(e.proxy_name),
    scope:                     e.scope,
    letter_date:               e.letter_date,
    signed:                    e.signed,
    extraction_confidence:     e.extraction_confidence,
  }
}

function redactDisclosr(e: DisclosrExtraction): HarnessDisclosrExtraction {
  return {
    applicant_name:            redactName(e.applicant_name),
    disclosure_date:           e.disclosure_date,
    monthly_obligations_cents: e.monthly_obligations_cents,
    signed:                    e.signed,
    extraction_confidence:     e.extraction_confidence,
  }
}

function redactDonationDeclaration(e: DonationDeclarationExtraction): HarnessDonationDeclarationExtraction {
  return {
    donor_name:        redactName(e.donor_name),
    donor_relationship: e.donor_relationship,
    recipient_name:    redactName(e.recipient_name),
    amount_cents:      e.amount_cents,
    purpose:           e.purpose,
    declaration_date:  e.declaration_date,
    signed:            e.signed,
    extraction_confidence: e.extraction_confidence,
  }
}

function redactMotivationLetter(e: MotivationLetterExtraction): HarnessMotivationLetterExtraction {
  return {
    applicant_name:           redactName(e.applicant_name),
    stated_reason_for_moving: e.stated_reason_for_moving,
    pets_mentioned:           e.pets_mentioned,
    employment_mentioned:     e.employment_mentioned,
    references_mentioned:     e.references_mentioned,
    letter_date:              e.letter_date,
    word_count:               e.word_count,
    extraction_confidence:    e.extraction_confidence,
  }
}

function redactRecommendationLetter(e: RecommendationLetterExtraction): HarnessRecommendationLetterExtraction {
  return {
    recommender_name:          redactName(e.recommender_name),
    recommender_relationship:  e.recommender_relationship,
    subject_name:              redactName(e.subject_name),
    sentiment:                 e.sentiment,
    payment_conduct_mentioned: e.payment_conduct_mentioned,
    letter_date:               e.letter_date,
    signed:                    e.signed,
    extraction_confidence:     e.extraction_confidence,
  }
}

function redactSalaryIncreaseLetter(e: SalaryIncreaseLetterExtraction): HarnessSalaryIncreaseLetterExtraction {
  return {
    employer_category:           categorizeEmployer(e.employer_name),
    employee_name:               redactName(e.employee_name),
    current_gross_monthly_cents: e.current_gross_monthly_cents,
    new_gross_monthly_cents:     e.new_gross_monthly_cents,
    effective_date:              e.effective_date,
    letter_date:                 e.letter_date,
    signed:                      e.signed,
    extraction_confidence:       e.extraction_confidence,
  }
}

function redactSarsIncomeTaxReference(e: SarsIncomeTaxReferenceExtraction): HarnessSarsIncomeTaxReferenceExtraction {
  return {
    taxpayer_name:           redactName(e.taxpayer_name),
    income_tax_number_last4: last4(e.income_tax_number),
    issue_date:              e.issue_date,
    extraction_confidence:   e.extraction_confidence,
  }
}

function redactSarsVatReference(e: SarsVatReferenceExtraction): HarnessSarsVatReferenceExtraction {
  const vn = e.vat_number
  return {
    entity_name:       e.entity_name,
    vat_number_last6:  vn && vn.length >= 6 ? vn.slice(-6) : vn,
    registration_date: e.registration_date,
    extraction_confidence: e.extraction_confidence,
  }
}

function redactSavingsAccountDetails(e: SavingsAccountDetailsExtraction): HarnessSavingsAccountDetailsExtraction {
  return {
    bank:                 e.bank,
    account_number_last4: e.account_number_last4,
    account_type:         e.account_type,
    balance_cents:        e.balance_cents,
    balance_date:         e.balance_date,
    extraction_confidence: e.extraction_confidence,
  }
}

function redactCreditBureauReport(e: CreditBureauReportExtraction): HarnessCreditBureauReportExtraction {
  return {
    subject_name:                    redactName(e.subject_name),
    report_date:                     e.report_date,
    credit_score:                    e.credit_score,
    total_accounts:                  e.total_accounts,
    accounts_in_arrears:             e.accounts_in_arrears,
    adverse_listings:                e.adverse_listings,
    total_monthly_obligations_cents: e.total_monthly_obligations_cents,
    bureau:                          e.bureau,
    extraction_confidence:           e.extraction_confidence,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function redactExtraction(docType: string | undefined, extraction: DocumentExtraction): HarnessDocumentExtraction {
  if (!extraction) return null
  switch (docType) {
    case "id-document":               return redactId(extraction as IDExtraction)
    case "payslip":                   return redactPayslip(extraction as PayslipExtraction)
    case "bank-statement":            return redactBankStatement(extraction as BankStatementExtraction)
    case "employer-letter":           return redactEmployerLetter(extraction as EmployerLetterExtraction)
    case "proof-of-address":          return redactProofOfAddress(extraction as ProofOfAddressExtraction)
    case "irp5":                      return redactIRP5(extraction as IRP5Extraction)
    case "ui19":                      return redactUI19(extraction as UI19Extraction)
    case "notice-of-assessment":      return redactNoticeOfAssessment(extraction as NoticeOfAssessmentExtraction)
    case "proxy-letter":              return redactProxyLetter(extraction as ProxyLetterExtraction)
    case "disclosr":                  return redactDisclosr(extraction as DisclosrExtraction)
    case "donation-declaration":      return redactDonationDeclaration(extraction as DonationDeclarationExtraction)
    case "motivation-letter":         return redactMotivationLetter(extraction as MotivationLetterExtraction)
    case "recommendation-letter":     return redactRecommendationLetter(extraction as RecommendationLetterExtraction)
    case "salary-increase-letter":    return redactSalaryIncreaseLetter(extraction as SalaryIncreaseLetterExtraction)
    case "sars-income-tax-reference": return redactSarsIncomeTaxReference(extraction as SarsIncomeTaxReferenceExtraction)
    case "sars-vat-reference":        return redactSarsVatReference(extraction as SarsVatReferenceExtraction)
    case "savings-account-details":   return redactSavingsAccountDetails(extraction as SavingsAccountDetailsExtraction)
    case "credit-bureau-report":      return redactCreditBureauReport(extraction as CreditBureauReportExtraction)
    default:                          return null
  }
}
