/**
 * lib/screening/bankStatementExtraction.ts — Extended Sonnet prompt + types for bank statement analysis
 *
 * Auth:   internal (called from server actions after document upload)
 * Data:   applicant-uploaded bank statement PDF via Supabase Storage
 * Notes:  Single Sonnet 4.6 call covers income extraction AND recurring-debit
 *         classification (ADDENDUM_14D). No second call — cost discipline.
 *         When classification_confidence < 0.7 on any debit, the applicant
 *         is shown a classification UI before the prescreen runs.
 */

export type ClassificationType =
  | 'rent_or_housing'
  | 'debt_repayment'
  | 'subscription'
  | 'utility'
  | 'insurance'
  | 'medical_aid'
  | 'school_fees'
  | 'transfer_to_business'
  | 'family_support_or_personal'
  | 'once_off_treated_as_such'
  | 'dont_recognise_flag_for_agent'
  | 'other'
  | 'unclassified_skipped'

export const COMMITMENT_CLASSIFICATIONS = new Set<ClassificationType>([
  'rent_or_housing',
  'debt_repayment',
  'subscription',
  'utility',
  'insurance',
  'medical_aid',
  'school_fees',
])

export interface RecurringDebit {
  payee_signature: string
  payee_description_example: string
  monthly_mean_cents: number
  monthly_min_cents: number
  monthly_max_cents: number
  monthly_variance_cents: number
  occurrence_count: number
  classification: ClassificationType
  classification_confidence: number
  classification_rationale: string
}

export interface StatementQuality {
  legibility: 'high' | 'medium' | 'low'
  period_coverage_days: number
  period_complete: boolean
  appears_edited: boolean
  notes: string
}

export interface DeclaredRentMatch {
  matched: boolean
  matched_payee_signature: string | null
  match_confidence: number
  fuzzy_match_reason: string
}

export interface PleksInvoiceReference {
  invoice_reference_seen: string
  statement_date: string
  amount_cents: number
}

export interface BankStatementExtraction {
  // Income (existing fields — unchanged)
  avg_monthly_income_cents: number | null
  months_analysed: number
  income_type: string
  income_consistency: number
  salary_detected: boolean
  bounced_debit_orders: number
  overdraft_occurrences: number
  garnishee_detected: boolean
  red_flags: string[]
  confidence: number
  notes: string
  income_in_foreign_currency: boolean
  income_currency_code: string
  income_foreign_amount: number | null

  // Identity match (ADDENDUM_14D)
  account_holder_name_extracted: string | null
  account_holder_name_match: 'exact' | 'variant' | 'mismatch' | 'unable_to_extract'
  account_holder_name_confidence: number

  // Statement quality (ADDENDUM_14D)
  statement_quality: StatementQuality

  // Recurring debits grouped (ADDENDUM_14D)
  recurring_debits: RecurringDebit[]

  // Declared rent match (ADDENDUM_14D) — null if current_rent_cents not provided
  declared_rent_match: DeclaredRentMatch | null

  // Pleks invoice references detected in statement (ADDENDUM_14D)
  pleks_invoice_references: PleksInvoiceReference[]
}

export function buildExtractionPrompt(params: {
  declaredFirstName: string
  declaredLastName: string
  declaredMonthlyIncomeCents: number | null
  currentRentCents: number | null
  currentHousingStatus: string | null
}): string {
  const { declaredFirstName, declaredLastName, declaredMonthlyIncomeCents, currentRentCents, currentHousingStatus } = params
  const declaredIncome = declaredMonthlyIncomeCents
    ? `R${(declaredMonthlyIncomeCents / 100).toFixed(2)}`
    : 'Not declared'
  const declaredRent = currentRentCents
    ? `R${(currentRentCents / 100).toFixed(2)}`
    : 'Not currently renting'

  return `You are analysing a 3-month South African bank statement to support a rental application affordability check. Be conservative and explicit about uncertainty. Do NOT comment on spending habits, personal choices, or lifestyle. Do NOT make character judgements.

APPLICANT-DECLARED CONTEXT:
- Declared name: ${declaredFirstName} ${declaredLastName}
- Declared monthly income: ${declaredIncome}
- Declared current rent: ${declaredRent}
- Declared housing status: ${currentHousingStatus ?? 'Not provided'}

CLASSIFICATION TAXONOMY (for recurring_debits[].classification):
rent_or_housing, debt_repayment, subscription, utility, insurance, medical_aid,
school_fees, transfer_to_business, family_support_or_personal,
once_off_treated_as_such, dont_recognise_flag_for_agent, other, unclassified_skipped

CLASSIFICATION RULES:
1. High confidence required — if uncertain (<0.7), use dont_recognise_flag_for_agent rather than guess.
2. Only "regular recurring monthly fixed-amount debits to identifiable third parties" count as commitments.
3. If declared current rent is provided, find and mark that line item explicitly — it will be excluded from Ratio 2 (commitment terminates on move).
4. Mark current-home utilities similarly — they terminate on move (rationale: "current home, will terminate on move").
5. Scan ALL debit descriptions for the regex pattern ${String.raw`Inv\.\d{8}-\d{1,6}`} (Pleks invoice format) and surface every match in pleks_invoice_references.

If income is in a foreign currency: set avg_monthly_income_cents to null, income_in_foreign_currency to true, income_currency_code to the ISO code, income_foreign_amount to the original amount.

Return ONLY valid JSON matching this schema:
{
  "avg_monthly_income_cents": integer or null,
  "months_analysed": integer,
  "income_type": "salary|freelance|business|mixed|unclear",
  "income_consistency": 0.0 to 1.0,
  "salary_detected": boolean,
  "bounced_debit_orders": integer,
  "overdraft_occurrences": integer,
  "garnishee_detected": boolean,
  "red_flags": ["factual observations only"],
  "confidence": 0.0 to 1.0,
  "notes": "extraction uncertainty notes",
  "income_in_foreign_currency": boolean,
  "income_currency_code": "ZAR or ISO code",
  "income_foreign_amount": number or null,

  "account_holder_name_extracted": "name as on statement or null",
  "account_holder_name_match": "exact|variant|mismatch|unable_to_extract",
  "account_holder_name_confidence": 0.0 to 1.0,

  "statement_quality": {
    "legibility": "high|medium|low",
    "period_coverage_days": integer,
    "period_complete": boolean,
    "appears_edited": boolean,
    "notes": "quality observations"
  },

  "recurring_debits": [
    {
      "payee_signature": "normalised payee identifier",
      "payee_description_example": "verbatim as on statement",
      "monthly_mean_cents": integer,
      "monthly_min_cents": integer,
      "monthly_max_cents": integer,
      "monthly_variance_cents": integer,
      "occurrence_count": integer,
      "classification": "one of the 13 categories above",
      "classification_confidence": 0.0 to 1.0,
      "classification_rationale": "why this category"
    }
  ],

  "declared_rent_match": ${currentRentCents ? `{
    "matched": boolean,
    "matched_payee_signature": "payee_signature or null",
    "match_confidence": 0.0 to 1.0,
    "fuzzy_match_reason": "explanation of match/no-match"
  }` : 'null'},

  "pleks_invoice_references": [
    {
      "invoice_reference_seen": "e.g. Inv.20260512-123",
      "statement_date": "YYYY-MM-DD",
      "amount_cents": integer
    }
  ]
}`
}

/**
 * Returns true if the item's final_classification should count toward Ratio 2 commitments.
 * Conservative: ambiguous items default to NOT counted.
 */
export function isCountedInCommitments(
  classification: ClassificationType,
  isSuppressed: boolean = false
): boolean {
  if (isSuppressed) return false
  return COMMITMENT_CLASSIFICATIONS.has(classification)
}

/**
 * Classifies the identity match between the extracted name and the declared name.
 * Variant: middle name, initials, maiden/married name, capitalisation differences.
 */
export function classifyNameMatch(
  extracted: string | null,
  declaredFirst: string,
  declaredLast: string
): { match: 'exact' | 'variant' | 'mismatch' | 'unable_to_extract'; confidence: number } {
  if (!extracted || extracted.trim() === '') {
    return { match: 'unable_to_extract', confidence: 0 }
  }

  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()

  const e = normalise(extracted)
  const d = normalise(`${declaredFirst} ${declaredLast}`)
  const dRev = normalise(`${declaredLast} ${declaredFirst}`)

  if (e === d || e === dRev) return { match: 'exact', confidence: 1 }

  const eParts = e.split(' ')
  const dParts = d.split(' ')

  // Initials match (e.g. "S Mthembu" vs "Sarah Mthembu")
  const firstInitialMatch = eParts[0]?.length === 1 && dParts[0]?.startsWith(eParts[0])
  const lastNameMatch = eParts.at(-1) === dParts.at(-1)

  // Substring containment (handles middle names, suffixes)
  const eContainsFirst = e.includes(normalise(declaredFirst))
  const eContainsLast  = e.includes(normalise(declaredLast))

  if ((firstInitialMatch && lastNameMatch) || (eContainsFirst && eContainsLast)) {
    return { match: 'variant', confidence: 0.8 }
  }

  if (eContainsLast || lastNameMatch) {
    return { match: 'variant', confidence: 0.6 }
  }

  return { match: 'mismatch', confidence: 0.9 }
}
