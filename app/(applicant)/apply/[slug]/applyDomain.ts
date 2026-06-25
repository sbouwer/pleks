/**
 * app/(applicant)/apply/[slug]/applyDomain.ts — shared apply-wizard domain (types + income/employment helpers)
 *
 * Notes:  Pure types, catalogs and money helpers shared by the orchestrator (save/submit/resume) AND both flow
 *         modules (individual/company). No JSX, no state — relocate-only from the StepPanel monolith. Per the
 *         apply-flow architecture, FLOWS stay separate; this is the common domain both build on.
 */
import type { PartyFormState, PartyPerson, PartyAddressInput, PartyBankAccountInput } from "@/lib/parties/partyValidation"

export type ApplicantType = "individual" | "couple" | "company" | "guarantor"
export type CoRole = "co_applicant" | "guarantor"
export type ScreeningStatus = "idle" | "done"

// Step indices into the wizard pane sequence — shared by the orchestrator's nav and the review step's amend links.
export const STEP_EXPENSES = 4
export const STEP_DOCUMENTS = 5        // Documents · Required (entry — createApplication lands here)
export const STEP_DOCS_OPTIONAL = 6    // Documents · Optional
export const STEP_REVIEW = 7
export const LAST_DATA_STEP = STEP_DOCS_OPTIONAL // panes 0–6 are data entry (get the panel header); 7 is the review

export type SetFn = (k: keyof PartyFormState, v: string | string[] | boolean | PartyPerson[] | PartyAddressInput[] | PartyBankAccountInput[]) => void

export interface DocFile { id: string; name: string; uploading: boolean; uploaded: boolean; storagePath: string | null; detection?: string | null; error?: string | null }
export interface CoApplicant { firstName: string; lastName: string; email: string; phone: string; idNumber: string; role: CoRole; invited: boolean }
export const blankCo = (role: CoRole): CoApplicant => ({ firstName: "", lastName: "", email: "", phone: "", idNumber: "", role, invited: false })

export type Emp = {
  employment_type: string; employer: string; start_date: string
  // Branching context (persisted in applications.employment_details jsonb) — qualifies the income figure.
  contract_end_date?: string; job_title?: string
  employer_contact_name?: string; employer_contact_detail?: string
  business_name?: string; business_nature?: string; trading_since?: string
  registered?: string; sars_registered?: string
}

export type IncomePeriod = "month" | "quarter" | "annual"
export type IncomeRow = { key: string; label: string; amount: string; period: IncomePeriod; custom?: boolean; speculative?: boolean }

export const EMPLOYMENT_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "permanent", label: "Permanently employed" },
  { value: "contract", label: "Fixed-term / contract" },
  { value: "self_employed", label: "Self-employed / business owner" },
  { value: "commission", label: "Commission-based" },
  { value: "freelance", label: "Freelance / independent" },
  { value: "retired", label: "Pensioner / retired" },
  { value: "grant", label: "Receiving grants" },
  { value: "unemployed", label: "Unemployed" },
]
export const employmentLabel = (v: string) => EMPLOYMENT_OPTIONS.find((o) => o.value === v)?.label ?? v
// Employment status routes the form into one of four branches (the downstream evidence ask follows suit):
//   employed → employer fields · self-employed/freelance → business fields · retired/grant → minimal · unemployed.
export const EMPLOYED_TYPES = ["permanent", "contract", "commission"]
export const SELF_EMPLOYED_TYPES = ["self_employed", "freelance"]
export const REGISTERED_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "none", label: "Not registered" },
  { value: "sole_prop", label: "Sole proprietor" },
  { value: "cipc", label: "CIPC-registered company" },
]
export const YESNO_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
]

export const PERIOD_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "annual", label: "Annual" },
]
export const PERIOD_DIVISOR: Record<IncomePeriod, number> = { month: 1, quarter: 3, annual: 12 }

/** The SA income-source catalog — grouped so a longer picker stays scannable; labels match how applicants
 *  describe their income. Keys align with the reconciler's evidence handling (employment / rental / dividends /
 *  savings_interest / maintenance / alimony + business / pension / grant). Child maintenance and spousal alimony
 *  are deliberately SEPARATE lines (different legal instruments, distinct proof). */
export const INCOME_CATALOG: { group: string; sources: { key: string; label: string }[] }[] = [
  { group: "Employment", sources: [
    { key: "employment", label: "Salary / wages (gross)" },
    { key: "other_remuneration", label: "Bonuses, commission or overtime" },
  ] },
  { group: "Self-employment", sources: [
    { key: "business", label: "Business / self-employment income" },
  ] },
  { group: "Property & investments", sources: [
    { key: "rental", label: "Rental income" },
    { key: "dividends", label: "Investment income (dividends)" },
    { key: "savings_interest", label: "Interest (savings / fixed deposit)" },
  ] },
  { group: "Pension & grants", sources: [
    { key: "pension", label: "Pension / annuity / provident fund" },
    { key: "grant", label: "Government grant (SASSA)" },
  ] },
  { group: "Support payments", sources: [
    { key: "maintenance", label: "Maintenance received (for a child)" },
    { key: "alimony", label: "Spousal maintenance / alimony" },
  ] },
  { group: "Other", sources: [
    { key: "other", label: "Other income" },
  ] },
]
export const INCOME_LABEL: Record<string, string> = Object.fromEntries(INCOME_CATALOG.flatMap((g) => g.sources.map((s) => [s.key, s.label])))

// A status-driven seed so the income grid opens AS a grid (a few rows) rather than one lonely line.
// Empty rows count for nothing and persist nothing. Unemployed/unmapped seeds nothing (empty-state + picker).
const PRIMARY_KEYS_BY_EMPLOYMENT: Record<string, string[]> = {
  permanent: ["employment", "other_remuneration"],
  contract: ["employment", "other_remuneration"],
  commission: ["employment", "other_remuneration"],
  self_employed: ["business"],
  freelance: ["business"],
  retired: ["pension"],
  grant: ["grant"],
}
const COMMON_EXTRA_KEYS = ["rental", "savings_interest"]
export function seedIncomeFor(employmentType: string): IncomeRow[] {
  const primaries = PRIMARY_KEYS_BY_EMPLOYMENT[employmentType]
  if (!primaries) return []
  const rows: IncomeRow[] = primaries.map((k) => ({ key: k, label: INCOME_LABEL[k] ?? k, amount: "", period: "month" }))
  // Speculative discovery slots (rental, interest): shown on desktop as prompts, hidden on mobile until used —
  // so a budget phone opens with just the status-driven primary row(s) + the picker, no dead rows.
  for (const k of COMMON_EXTRA_KEYS) {
    if (!rows.some((r) => r.key === k)) rows.push({ key: k, label: INCOME_LABEL[k] ?? k, amount: "", period: "month", speculative: true })
  }
  return rows
}

// Expenses · COMMITMENTS — committed financial obligations that compete with rent (debt + contractual), NOT a
// household budget: general living (groceries/transport/utilities) is already in the residual's living floor, and
// child-specific costs live in the Child & dependents section (offset by maintenance). Keys map to the deep-scan's
// debit-order categories for flag-10 corroboration. School fees are deliberately NOT here; child maintenance PAID
// is (money out, no offset).
export const COMMITMENT_CATALOG: { group: string; sources: { key: string; label: string }[] }[] = [
  { group: "Debt repayments", sources: [
    { key: "vehicle_finance", label: "Vehicle finance" },
    { key: "personal_loan", label: "Personal loan" },
    { key: "credit_card", label: "Credit card repayment" },
    { key: "store_account", label: "Store / retail account" },
    { key: "student_loan", label: "Student loan" },
  ] },
  { group: "Insurance & policies", sources: [
    { key: "medical_aid", label: "Medical aid" },
    { key: "life_funeral", label: "Life / funeral cover" },
    { key: "short_term_insurance", label: "Short-term insurance (car / household)" },
  ] },
  { group: "Support & family", sources: [
    { key: "school_fees", label: "School / education fees" },
    { key: "child_maintenance_paid", label: "Child maintenance paid" },
    { key: "family_support", label: "Family support" },
  ] },
  { group: "Subscriptions & connectivity", sources: [
    { key: "entertainment", label: "Entertainment / streaming (DStv, Netflix, Disney+)" },
    { key: "internet", label: "Internet / fibre" },
    { key: "mobile", label: "Mobile / airtime contract" },
  ] },
  { group: "Other housing", sources: [
    { key: "other_rent_bond", label: "Other rent or bond" },
    { key: "levies_rates", label: "Levies / rates" },
  ] },
  { group: "Other", sources: [
    { key: "other", label: "Other monthly commitment" },
  ] },
]
export const COMMITMENT_LABEL: Record<string, string> = Object.fromEntries(COMMITMENT_CATALOG.flatMap((g) => g.sources.map((s) => [s.key, s.label])))
// Seed the 2–3 most common (kind to a budget Android — not all thirteen as empty rows); the rest via the picker.
const COMMITMENT_SEED_KEYS = ["vehicle_finance", "store_account", "medical_aid"]
export function seedCommitments(): IncomeRow[] {
  return COMMITMENT_SEED_KEYS.map((k) => ({ key: k, label: COMMITMENT_LABEL[k] ?? k, amount: "", period: "month" }))
}

export const moneyCents = (s: string) => Math.round(parseFloat(s.replaceAll(/[^\d.]/g, "") || "0") * 100)
/** A whole-number text field → int or null (blank → null). For dependant counts + the rands-as-int payload fields. */
export const intOrNull = (s: string): number | null => (s.trim() === "" ? null : Number.parseInt(s, 10))
/** True when no row has a typed amount — safe to (re)seed the grid without clobbering entered figures. */
export const allAmountsEmpty = (rows: IncomeRow[]): boolean => rows.every((r) => moneyCents(r.amount) === 0)
/** A positive number, else null — so a zero count / total persists as null (not 0). */
export const posOrNull = (n: number): number | null => (n > 0 ? n : null)
/** Seed an empty grid (no rows yet) without clobbering an in-progress one. */
export const seedIfEmpty = (rows: IncomeRow[], set: (v: IncomeRow[]) => void, make: () => IncomeRow[]) => { if (rows.length === 0) set(make()) }
/** A resumed numeric value → its string form for a text input (null/undefined → blank). */
export const numStr = (n: number | null | undefined): string => (n != null ? String(n) : "")
export const rowMonthlyCents = (r: IncomeRow) => Math.round(moneyCents(r.amount) / PERIOD_DIVISOR[r.period])
/** The income rows are the source of truth; this monthly total is the derived affordability anchor. Any path
 *  that edits the rows must recompute this (and the persisted total) or they drift. */
export function totalMonthlyCents(rows: IncomeRow[]): number {
  return rows.reduce((sum, r) => sum + rowMonthlyCents(r), 0)
}
/** Bounded payload the create route stores in applications.income_sources (rows with a real amount only). */
export function incomeSourcesPayload(rows: IncomeRow[]) {
  return rows
    .filter((r) => moneyCents(r.amount) > 0)
    .map((r) => ({ key: r.key, label: r.label, amount_cents: moneyCents(r.amount), period: r.period, monthly_cents: rowMonthlyCents(r) }))
}

/** Income-source keys with a positive declared amount — the input to the shared deriveDocCategories. */
export function incomeKeys(income: IncomeRow[]): Set<string> {
  return new Set(income.filter((r) => moneyCents(r.amount) > 0).map((r) => r.key))
}
