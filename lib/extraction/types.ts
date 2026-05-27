/**
 * lib/extraction/types.ts — Document extraction pipeline type definitions
 *
 * Spec: ADDENDUM_14L §4.4
 */

export type DocumentFormat =
  | "pdf"
  | "image-jpeg"
  | "image-png"
  | "image-other"
  | "docx"
  | "odt"
  | "psd"
  | "unknown"

/**
 * Four deterministic archetypes derived from unitType + applicantCount.
 * Subtypes (guarantee, family, destressed) are document-signal patterns,
 * not archetypes — Claude surfaces them through document type classification.
 */
export type ApplicationArchetype =
  | "residential-single"
  | "residential-multi"
  | "commercial-single-director"
  | "commercial-multi-director"

export type UnitType = "residential" | "commercial"

export type DocumentType =
  | "id-document"
  | "payslip"
  | "bank-statement"
  | "employer-letter"
  | "irp5"
  | "ui19"
  | "notice-of-assessment"
  | "proof-of-address"
  | "proxy-letter"
  | "disclosr"
  | "donation-declaration"
  | "motivation-letter"
  | "recommendation-letter"
  | "salary-increase-letter"
  | "sars-income-tax-reference"
  | "sars-vat-reference"
  | "savings-account-details"
  | "credit-bureau-report"
  | "application-form"
  | "work-contract"
  | "reference-letter"
  | "unknown"

export interface Document {
  path: string
  filename: string
  bytes: Uint8Array
  mimeType: string
  format?: DocumentFormat
  documentType?: DocumentType
  documentTypeConfidence?: number
  language?: "en" | "af" | "mixed" | "unknown"
}

export interface ApplicationInput {
  unitType: UnitType
  applicantCount: number
  documents: Document[]
  metadata: {
    source: "harness" | "production"
    orgId?: string
    applicationId?: string
  }
}

export interface ExtractedField<T> {
  value: T
  confidence: number
  sourceDocumentPath: string
  rawText?: string
}

export interface CrossDocumentReconciliation {
  field: string
  sources: Array<{ documentPath: string; value: unknown }>
  resolved: unknown
  conflict: boolean
  conflictNote?: string
}

export type FraudSignalSeverity = "low" | "medium" | "high"

export interface FraudSignal {
  type: string
  severity: FraudSignalSeverity
  description: string
  affectedDocuments: string[]
}

export interface ApplicationExtraction {
  applicationId?: string
  archetype: ApplicationArchetype
  documents: Document[]
  reconciliation: CrossDocumentReconciliation[]
  fraudSignals: FraudSignal[]
  metadata: {
    processedAt: string
    totalDocuments: number
    successfulExtractions: number
  }
}

// ─── Phase 2a per-extractor schemas ───────────────────────────────────────────

export interface IDExtraction {
  document_type: "sa-id-book" | "sa-smart-id" | "passport" | "other"
  full_name: string | null
  id_number: string | null
  date_of_birth: string | null    // YYYY-MM-DD
  gender: "M" | "F" | null
  citizenship: "SA" | "non-SA" | null
  expiry_date: string | null
  extraction_confidence: number
}

export interface PayslipExtraction {
  employer_name: string | null
  employee_name: string | null
  pay_period: string | null           // YYYY-MM or "YYYY-MM-DD/YYYY-MM-DD"
  language: "en" | "af" | "mixed"
  gross_pay_cents: number | null
  net_pay_cents: number | null
  deductions: Array<{ label: string; amount_cents: number }>
  ytd_gross_cents: number | null
  ytd_paye_cents: number | null
  payment_method: "eft" | "cash" | "cheque" | "unknown"
  bank_account_last4: string | null
  extraction_confidence: number
}

export type BankName =
  | "FNB" | "Standard Bank" | "ABSA" | "Nedbank" | "Capitec"
  | "Investec" | "Discovery" | "TymeBank" | "African Bank" | "Bidvest" | "other"

export interface BankStatementExtraction {
  bank: BankName
  account_number_last4: string | null
  account_type: "cheque" | "savings" | "credit" | "transmission" | "other"
  statement_period_from: string | null   // YYYY-MM-DD
  statement_period_to: string | null
  opening_balance_cents: number | null
  closing_balance_cents: number | null
  inflows: Array<{
    date: string            // YYYY-MM-DD
    amount_cents: number
    counterparty_category: "salary" | "rental-deposit" | "transfer" | "refund" | "other"
    counterparty_label: string
  }>
  outflows: Array<{
    date: string            // YYYY-MM-DD
    amount_cents: number
    counterparty_category: "rent" | "debit-order" | "utility" | "retail" | "atm" | "transfer" | "loan" | "other"
    counterparty_label: string
  }>
  income_indicators: {
    regular_salary_detected: boolean
    average_monthly_inflow_cents: number | null
    debit_order_volume_cents: number | null
    end_of_month_dip_detected: boolean
  }
  extraction_confidence: number
}

export interface EmployerLetterExtraction {
  employer_name: string | null
  employer_address: string | null
  employer_contact: string | null
  employee_name: string | null
  employment_start_date: string | null   // YYYY-MM-DD
  employment_type: "permanent" | "contract" | "probation" | "unknown"
  job_title: string | null
  gross_monthly_salary_cents: number | null
  net_monthly_salary_cents: number | null
  signed: boolean
  letter_date: string | null             // YYYY-MM-DD
  extraction_confidence: number
}

export interface ProofOfAddressExtraction {
  document_subtype: "utility-bill" | "municipal-account" | "bank-letter" | "lease" | "other"
  full_name: string | null
  address_line1: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  document_date: string | null           // YYYY-MM-DD
  issuer: string | null
  extraction_confidence: number
}

// ─── Phase 2b per-extractor schemas ──────────────────────────────────────────

export interface IRP5Extraction {
  employer_name: string | null
  employee_name: string | null
  tax_year: string | null                    // e.g. "2024" = Mar 2023–Feb 2024
  gross_remuneration_cents: number | null
  paye_deducted_cents: number | null
  uif_employee_cents: number | null
  income_tax_number: string | null
  extraction_confidence: number
}

export interface UI19Extraction {
  employee_name: string | null
  employer_name: string | null
  date_of_termination: string | null         // YYYY-MM-DD
  reason_for_termination: "retrenchment" | "resignation" | "dismissal" | "contract-expiry" | "other" | null
  last_monthly_salary_cents: number | null
  extraction_confidence: number
}

export interface NoticeOfAssessmentExtraction {
  tax_year: string | null
  assessment_date: string | null             // YYYY-MM-DD
  taxable_income_cents: number | null
  tax_payable_cents: number | null           // negative = refund owed to taxpayer
  income_tax_number: string | null
  extraction_confidence: number
}

export interface ProxyLetterExtraction {
  company_name: string | null
  authorising_director_name: string | null
  proxy_name: string | null
  scope: string | null
  letter_date: string | null
  signed: boolean
  extraction_confidence: number
}

export interface DisclosrExtraction {
  applicant_name: string | null
  disclosure_date: string | null
  monthly_obligations_cents: number | null   // declared existing credit obligations
  signed: boolean
  extraction_confidence: number
}

export interface DonationDeclarationExtraction {
  donor_name: string | null
  donor_relationship: string | null          // e.g. "parent", "sibling"
  recipient_name: string | null
  amount_cents: number | null
  purpose: string | null                     // e.g. "rental deposit"
  declaration_date: string | null
  signed: boolean
  extraction_confidence: number
}

export interface MotivationLetterExtraction {
  applicant_name: string | null
  stated_reason_for_moving: string | null    // brief summary, no raw address
  pets_mentioned: boolean
  employment_mentioned: boolean
  references_mentioned: boolean
  letter_date: string | null
  word_count: number | null
  extraction_confidence: number
}

export interface RecommendationLetterExtraction {
  recommender_name: string | null
  recommender_relationship: "previous-landlord" | "employer" | "community" | "other" | null
  subject_name: string | null
  sentiment: "positive" | "neutral" | "negative" | null
  payment_conduct_mentioned: boolean
  letter_date: string | null
  signed: boolean
  extraction_confidence: number
}

export interface SalaryIncreaseLetterExtraction {
  employer_name: string | null
  employee_name: string | null
  current_gross_monthly_cents: number | null
  new_gross_monthly_cents: number | null
  effective_date: string | null              // YYYY-MM-DD
  letter_date: string | null
  signed: boolean
  extraction_confidence: number
}

export interface SarsIncomeTaxReferenceExtraction {
  taxpayer_name: string | null
  income_tax_number: string | null
  issue_date: string | null
  extraction_confidence: number
}

export interface SarsVatReferenceExtraction {
  entity_name: string | null
  vat_number: string | null
  registration_date: string | null
  extraction_confidence: number
}

export interface SavingsAccountDetailsExtraction {
  bank: BankName | null
  account_number_last4: string | null
  account_type: "savings" | "fixed-deposit" | "money-market" | "other"
  balance_cents: number | null
  balance_date: string | null                // YYYY-MM-DD — "as at" date
  extraction_confidence: number
}

export interface CreditBureauReportExtraction {
  subject_name: string | null
  report_date: string | null
  credit_score: number | null
  total_accounts: number | null
  accounts_in_arrears: number | null
  adverse_listings: number | null            // judgments, defaults, write-offs
  total_monthly_obligations_cents: number | null
  bureau: "TransUnion" | "Experian" | "Compuscan" | "XDS" | "other" | null
  extraction_confidence: number
}

export type DocumentExtraction =
  | IDExtraction
  | PayslipExtraction
  | BankStatementExtraction
  | EmployerLetterExtraction
  | ProofOfAddressExtraction
  | IRP5Extraction
  | UI19Extraction
  | NoticeOfAssessmentExtraction
  | ProxyLetterExtraction
  | DisclosrExtraction
  | DonationDeclarationExtraction
  | MotivationLetterExtraction
  | RecommendationLetterExtraction
  | SalaryIncreaseLetterExtraction
  | SarsIncomeTaxReferenceExtraction
  | SarsVatReferenceExtraction
  | SavingsAccountDetailsExtraction
  | CreditBureauReportExtraction
  | null
