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
  /** Decrypted plain text for an encrypted (empty-password) PDF — Claude can't read the encrypted bytes, so the
   *  pipeline sets this and toMediaBlock sends it as a text document block instead. (lib/extraction/pdfDecrypt) */
  textContent?: string
  /** The document type implied by the UPLOAD SLOT the applicant chose (id / payslips / bank_main / …). When set,
   *  the pipeline trusts it and SKIPS the Haiku classification call, then validates the extraction against it
   *  (a wrong-type doc in a slot is flagged, not silently extracted). Unset for the free-form "other" slot. */
  slotType?: DocumentType
}

export interface ApplicationInput {
  unitType: UnitType
  applicantCount: number
  documents: Document[]
  declared?: DeclaredContext        // optional — production supplies it; harness omits it
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

// ─── Phase 3: reconciliation + fraud signals ─────────────────────────────────
// Deterministic (NOT an AI call — ADDENDUM_14L §4.7 Sonnet reconciler superseded). The shape is defined by
// its downstream consumer, the affordability prescreen ruling (ADDENDUM_14M): each field maps to a 14M flag.

/** Bump when the deterministic reconciliation logic changes — lets a 14M evaluation replay exactly
 *  (reproducibility is the FitScore/POPIA s71 defence; ADDENDUM_14H delivery §8 mechanism #5). */
export const RECONCILER_VERSION = "recon.v2"  // v2: oldest/newestDocumentDate span actual statement coverage (period_from fed too)

export type IncomeMatchStatus = "corroborated" | "variance" | "uncorroborated" | "no-evidence"

/** One declared income source matched against the uploaded evidence. Unresolved attribution → "uncorroborated"
 *  (never an AI guess) → 14M flag 5 remediation. Powers 14M flags 5 & 6. */
export interface DeclaredSourceReconciliation {
  source_key: string                  // aligns with SEED_INCOME keys (employment, rental, dividends, …)
  label: string
  declared_monthly_cents: number
  evidenced_monthly_cents: number | null
  variance_pct: number | null         // (declared − evidenced) / declared, rounded %
  match_confidence: number            // 0..1
  status: IncomeMatchStatus
  evidenceDocType: DocumentType | null
}

/** Demonstrated own-name recurring housing payment (rent/bond) — 14M flag 0 affordability override. */
export interface HousingPaymentReconciliation {
  detected: boolean
  recurring_monthly_cents: number | null
  months_observed: number
  anyMissedOrReturned: boolean
}

export type ConsistencyVerdict = "consistent" | "minor-variation" | "material-mismatch" | "insufficient-data"

/** Cross-document identity consistency — 14M flag 7. */
export interface IdentityConsistency {
  name: ConsistencyVerdict
  idNumber: "consistent" | "missing-some" | "mismatch" | "insufficient-data"
}

/** Document recency + quantity — 14M flags 3 & 4 (14M judges sufficiency against the income type). */
export interface DocumentRecency {
  oldestDocumentDate: string | null   // ISO YYYY-MM-DD
  newestDocumentDate: string | null
  mostRecentWithinDays: number | null
  salariedMonthsCovered: number       // = monthsCovered.length
  monthsCovered: string[]             // sorted unique YYYY-MM — lets 14M judge "3 CONSECUTIVE recent months"
  consecutive: boolean                // are monthsCovered an unbroken run (no gap)? (14M flag 3)
}

/** Deterministic reconciliation over the per-document extractions — the Confidence axis 14M rules over. */
/** Payslip net pay vs the recurring bank salary credit — 14M flag 8 (garnishee / emoluments-attachment, or
 *  salary paid into another account). Inputs already loaded (payslip + bank), so it's near-free here. */
export interface NetPayVsCreditCheck {
  payslip_net_cents: number | null
  bank_salary_credit_cents: number | null
  gap_pct: number | null
  verdict: "match" | "gap" | "insufficient-data"
}

export interface ReconciliationResult {
  reconcilerVersion: string
  declaredSources: DeclaredSourceReconciliation[]
  housingPayment: HousingPaymentReconciliation
  netPayVsCredit: NetPayVsCreditCheck
  identity: IdentityConsistency
  recency: DocumentRecency
}

/** Heuristic, format/metadata-based fraud signals (no AI — D-14L-09). Descriptions are PII-safe by
 *  construction (they NEVER echo a raw ID / account number). */
export type FraudSignalType =
  | "psd-source-detected"
  | "embedded-id-in-filename"
  | "editor-software-source"
  | "low-extraction-confidence"
  | "document-type-mismatch"   // a slot-trusted doc didn't extract as its expected type (skip-classification guard)
export type FraudSignalSeverity = "info" | "warning" | "critical"
export interface FraudSignal {
  type: FraudSignalType
  severity: FraudSignalSeverity
  documentPath: string
  description: string
}

/** Declared application facts the reconciler compares evidence against. Optional: the harness omits it
 *  (declared-source matching is skipped); production supplies it from the application record. */
export interface DeclaredContext {
  appliedRentCents?: number
  applicant?: { fullName?: string; idNumber?: string }
  incomeSources?: Array<{ key: string; label: string; monthly_cents: number; variable?: boolean }>
}

/** Per-document pipeline result (gating + classification + extraction). Lives here (not in pipeline.ts) so the
 *  reconciler/fraud modules can consume it without a value-import cycle through the pipeline. */
export interface PipelineDocumentResult {
  filename: string
  path: string
  status: "classified" | "rejected-at-upload"
  rejectionReason?: string
  format?: string
  documentType?: string
  documentTypeConfidence?: number
  language?: string
  classifyNote?: string
  extracted?: DocumentExtraction
  extractionConfidence?: number
}

export interface PipelineResult {
  archetype: ApplicationArchetype
  documents: PipelineDocumentResult[]
  reconciliation: ReconciliationResult
  fraudSignals: FraudSignal[]
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
    counterparty_category: "rent" | "home-loan" | "debit-order" | "utility" | "retail" | "atm" | "transfer" | "loan" | "other"
    counterparty_label: string
  }>
  income_indicators: {
    regular_salary_detected: boolean
    average_monthly_inflow_cents: number | null
    debit_order_volume_cents: number | null
    end_of_month_dip_detected: boolean
  }
  // Aggregates for the affordability obligations picture — feed flags 10–13 (debit-order load, returned debits,
  // overdraft, declining balance trend) AND flag 0b's observed_obligations / residual-income override. Captured
  // now so the bank schema doesn't need re-extraction when those flags land. (ADDENDUM_14M)
  monthly_summary: Array<{ month: string; closing_balance_cents: number | null }>  // per-month → balance trend
  returned_debit_count: number | null   // returned/bounced/unpaid debit-order events (flag 12)
  overdraft_days: number | null         // count of days the balance was below zero (flag 13)
  lowest_balance_cents: number | null   // trough balance over the period (overdraft depth; can be negative)
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
