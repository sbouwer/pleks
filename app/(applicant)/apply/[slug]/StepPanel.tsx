"use client"

/**
 * app/(applicant)/apply/[slug]/preview/StepPanel.tsx — the interactive apply wizard (client island)
 *
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  A 4-card LANDING (application type) → a functional grouped wizard wired to the REAL backend
 *         (Personal details · Finances [Employment/Income/Expenses] · Documents [Required/Optional] · Review).
 *         Every type except "Just me" implies >1 party, so the co-applicant/company invite is captured UP
 *         FRONT (an InviteCapture panel right after the landing) and dispatched once the application exists.
 *           Landing — Just me · Couple/multiple · Company · On behalf/guarantor (each a short blurb).
 *           1 Personal details — the applicant (or, for a company, the contact/director) reuses the
 *             add-tenant capture (IndividualIdentity; SA-ID auto-fills DOB+gender).
 *           2 Address — mandatory current address.
 *           3 Finances — employment status + date employed + employer, then an "excel" sources-of-income grid
 *             (Employment gross + rental/maintenance/… + custom), each with a period (expenses to follow)
 *             (month/quarter/annual). The monthly total drives affordability → POST create (also persists
 *             the breakdown to applications.income_sources + employment_start_date; probation is inferred,
 *             and the held at-selection invites are dispatched here once the application id exists).
 *           4 Documents — upload to the application-docs bucket + AI detect (same as the live flow).
 *           5 Applicants — status roster of every party (primary + company + co-applicants), each invited
 *             with email + id_number (links them) → POST /api/applications/[id]/co-applicant; + add another.
 *             Submit unlocks only when every applicant is "green" (information complete).
 *           6 Submit — POPIA consent → POST submit → reveal the pre-screen "application preview".
 *         The server page renders the shell + left cards and passes slug/orgId/rent + agent contact.
 */

import { useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Plus, X, Upload, FileText, CheckCircle2, Loader2, AlertCircle, ShieldCheck, User, Users, Building2, HandCoins, ArrowLeft, ArrowRight, Pencil, Clock, LogIn } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { useBegun } from "./applyChrome"
import type { LucideIcon } from "lucide-react"
import { IndividualIdentity } from "@/components/parties/partySteps"
import { SectLabel, AddressFields } from "@/components/parties/partyFields"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import { validateUpload } from "@/lib/extraction/uploadValidator"
import { deriveDocCategories, categoryForFilename, type DocCategory } from "@/lib/applications/docCategories"
import {
  validateIdentityCore, validateAddressStep,
  type PartyFormState, type PartyErrors, type PartyAddressInput, type PartyPerson, type PartyBankAccountInput,
} from "@/lib/parties/partyValidation"
import { formatZAR, startedWithinProbation, PROBATION_MONTHS } from "@/lib/constants"
import type { FreeAssessmentResult } from "@/lib/applications/freeAssessment"

type ApplicantType = "individual" | "couple" | "company" | "guarantor"
const TYPE_LABEL: Record<ApplicantType, string> = { individual: "Individual", couple: "Couple", company: "Company", guarantor: "With a guarantor" }
/** Card copy adapts to the lease type — "I'll live here" makes no sense on a commercial lease. */
function typesFor(commercial: boolean): ReadonlyArray<{ id: ApplicantType; icon: LucideIcon; title: string; blurb: string }> {
  return [
    { id: "individual", icon: User, title: commercial ? "Sole proprietor" : "Just me", blurb: commercial ? "I'm leasing in my own name (sole proprietor)." : "I'll be the only person on the lease." },
    { id: "couple", icon: Users, title: commercial ? "Partners / multiple" : "Couple / multiple", blurb: commercial ? "Two or more partners on the lease together — each gets their own secure link." : "Two or more of us will be on the lease together — each gets their own secure link." },
    { id: "guarantor", icon: HandCoins, title: "On behalf / guarantor", blurb: commercial ? "A surety backs the application but won't be on the lease." : "Someone backs the application financially but won't live here — e.g. a parent for an adult child." },
    { id: "company", icon: Building2, title: "Company", blurb: "A registered business is leasing, with a director signing surety." },
  ]
}

// Top-level wizard steps. "Apply as" is the pre-form type/invite stage (no form-pane index). The form panes
// (step indices 0–5) each belong to a step + carry a sub-tab label — PANE_META drives the two-level nav. Phase 1
// is presentation-only: the linear `step` machine + create boundary are unchanged; later phases split panes.
const STEP_GROUPS = ["Apply as", "Personal details", "Finances", "Documents", "Application review"] as const
const PANE_META = [
  { group: "Personal details",   sub: "Personal information" }, // step 0
  { group: "Personal details",   sub: "Address" },             // step 1
  { group: "Finances",           sub: "Employment" },          // step 2
  { group: "Finances",           sub: "Income" },              // step 3
  { group: "Finances",           sub: "Expenses" },            // step 4
  { group: "Documents",          sub: "Required" },            // step 5
  { group: "Documents",          sub: "Optional" },            // step 6
  { group: "Application review", sub: "Check & submit" },      // step 7 (applicants are set at "Apply as")
] as const
// Boundary indices (so the step machine reads clearly): the app is created leaving the last Finances pane.
const STEP_EXPENSES = 4
const STEP_DOCUMENTS = 5        // Documents · Required (entry — createApplication lands here)
const STEP_DOCS_OPTIONAL = 6    // Documents · Optional
const STEP_REVIEW = 7
const LAST_DATA_STEP = STEP_DOCS_OPTIONAL // panes 0–6 are data entry (get the panel header); 7 is the review
const GROUP_PANES: Record<string, number[]> = {}
PANE_META.forEach((m, i) => {
  GROUP_PANES[m.group] ??= []
  GROUP_PANES[m.group].push(i)
})

const EMPLOYMENT_OPTIONS = [
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
const employmentLabel = (v: string) => EMPLOYMENT_OPTIONS.find((o) => o.value === v)?.label ?? v
// Employment status routes the form into one of four branches (the downstream evidence ask follows suit):
//   employed → employer fields · self-employed/freelance → business fields · retired/grant → minimal · unemployed.
const EMPLOYED_TYPES = ["permanent", "contract", "commission"]
const SELF_EMPLOYED_TYPES = ["self_employed", "freelance"]
const REGISTERED_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "none", label: "Not registered" },
  { value: "sole_prop", label: "Sole proprietor" },
  { value: "cipc", label: "CIPC-registered company" },
]
const YESNO_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
]

type SetFn = (k: keyof PartyFormState, v: string | string[] | boolean | PartyPerson[] | PartyAddressInput[] | PartyBankAccountInput[]) => void
type Emp = {
  employment_type: string; employer: string; start_date: string
  // Branching context (persisted in applications.employment_details jsonb) — qualifies the income figure.
  contract_end_date?: string; job_title?: string
  employer_contact_name?: string; employer_contact_detail?: string
  business_name?: string; business_nature?: string; trading_since?: string
  registered?: string; sars_registered?: string
}
type CoRole = "co_applicant" | "guarantor"

type IncomePeriod = "month" | "quarter" | "annual"
type IncomeRow = { key: string; label: string; amount: string; period: IncomePeriod; custom?: boolean; speculative?: boolean }
const PERIOD_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "annual", label: "Annual" },
]
const PERIOD_DIVISOR: Record<IncomePeriod, number> = { month: 1, quarter: 3, annual: 12 }
/** The SA income-source catalog — grouped so a longer picker stays scannable; labels match how applicants
 *  describe their income. Keys align with the reconciler's evidence handling (employment / rental / dividends /
 *  savings_interest / maintenance / alimony + business / pension / grant). Child maintenance and spousal alimony
 *  are deliberately SEPARATE lines (different legal instruments, distinct proof). */
const INCOME_CATALOG: { group: string; sources: { key: string; label: string }[] }[] = [
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
const INCOME_LABEL: Record<string, string> = Object.fromEntries(INCOME_CATALOG.flatMap((g) => g.sources.map((s) => [s.key, s.label])))
// Seed from the employment status the applicant already picked — the primary row(s) implied by their status,
// plus a couple of broadly-common slots so the grid opens AS a grid (a few rows) rather than one lonely line.
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
function seedIncomeFor(employmentType: string): IncomeRow[] {
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
const COMMITMENT_CATALOG: { group: string; sources: { key: string; label: string }[] }[] = [
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
const COMMITMENT_LABEL: Record<string, string> = Object.fromEntries(COMMITMENT_CATALOG.flatMap((g) => g.sources.map((s) => [s.key, s.label])))
// Seed the 2–3 most common (kind to a budget Android — not all thirteen as empty rows); the rest via the picker.
const COMMITMENT_SEED_KEYS = ["vehicle_finance", "store_account", "medical_aid"]
function seedCommitments(): IncomeRow[] {
  return COMMITMENT_SEED_KEYS.map((k) => ({ key: k, label: COMMITMENT_LABEL[k] ?? k, amount: "", period: "month" }))
}

const moneyCents = (s: string) => Math.round(parseFloat(s.replaceAll(/[^\d.]/g, "") || "0") * 100)
/** A whole-number text field → int or null (blank → null). For dependant counts + the rands-as-int payload fields. */
const intOrNull = (s: string): number | null => (s.trim() === "" ? null : Number.parseInt(s, 10))
/** True when no row has a typed amount — safe to (re)seed the grid without clobbering entered figures. */
const allAmountsEmpty = (rows: IncomeRow[]): boolean => rows.every((r) => moneyCents(r.amount) === 0)
/** A positive number, else null — so a zero count / total persists as null (not 0). */
const posOrNull = (n: number): number | null => (n > 0 ? n : null)
/** Seed an empty grid (no rows yet) without clobbering an in-progress one. */
const seedIfEmpty = (rows: IncomeRow[], set: (v: IncomeRow[]) => void, make: () => IncomeRow[]) => { if (rows.length === 0) set(make()) }
/** A resumed numeric value → its string form for a text input (null/undefined → blank). */
const numStr = (n: number | null | undefined): string => (n != null ? String(n) : "")
const rowMonthlyCents = (r: IncomeRow) => Math.round(moneyCents(r.amount) / PERIOD_DIVISOR[r.period])
/** The income rows are the source of truth; this monthly total is the derived affordability anchor. Any path
 *  that edits the rows must recompute this (and the persisted total) or they drift. */
function totalMonthlyCents(rows: IncomeRow[]): number {
  return rows.reduce((sum, r) => sum + rowMonthlyCents(r), 0)
}
/** Bounded payload the create route stores in applications.income_sources (rows with a real amount only). */
function incomeSourcesPayload(rows: IncomeRow[]) {
  return rows
    .filter((r) => moneyCents(r.amount) > 0)
    .map((r) => ({ key: r.key, label: r.label, amount_cents: moneyCents(r.amount), period: r.period, monthly_cents: rowMonthlyCents(r) }))
}

interface DocFile { id: string; name: string; uploading: boolean; uploaded: boolean; storagePath: string | null; detection?: string | null; error?: string | null }

/** Income-source keys with a positive declared amount — the input to the shared deriveDocCategories. */
function incomeKeys(income: IncomeRow[]): Set<string> {
  return new Set(income.filter((r) => moneyCents(r.amount) > 0).map((r) => r.key))
}

interface CoApplicant { firstName: string; lastName: string; email: string; phone: string; idNumber: string; role: CoRole; invited: boolean }
interface CompanyInfo { companyType: string; companyReg: string }
// "done" = the Step-1 free assessment is ready to show (it's instant — no processing/poll). The deep-scan ruling
// moved off the applicant flow to the agent's shortlist step (Step 2). (ADDENDUM_14M three-step funnel)
type ScreeningStatus = "idle" | "done"
const COMPANY_TYPE_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "pty_ltd", label: "(Pty) Ltd" },
  { value: "cc", label: "Close Corporation (CC)" },
  { value: "npc", label: "Non-Profit Company" },
  { value: "trust", label: "Trust" },
  { value: "sole_prop", label: "Sole proprietor" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other" },
]
const blankCo = (role: CoRole): CoApplicant => ({ firstName: "", lastName: "", email: "", phone: "", idNumber: "", role, invited: false })
/** "Green" = enough to invite AND link them to the application: a name, an email, and an ID number. */
const coComplete = (c: CoApplicant) => Boolean(c.firstName.trim() && c.email.trim() && c.idNumber.trim())

// ── Resume (save & finish later) ──────────────────────────────────────────────
export interface ResumeState {
  applicationId: string; token: string; step: number; savedAt: string | null
  applicantType: ApplicantType | null; company: CompanyInfo | null; emailVerified: boolean
  form: Partial<PartyFormState>; emp: Emp; dependents: number | null
  dependentAdults?: number | null; dependentMinors?: number | null
  incomeSources: { key: string; label: string; amount_cents: number; period: string }[]
  commitments?: { key: string; label: string; amount_cents: number; period: string }[]
  coApplicants: CoApplicant[]; docPaths: { name: string; storagePath: string }[]
}
/** Rebuild an editable line-item grid (income or commitments) from a persisted source list — one row per stored
 *  item (the grid grows from the seed + picker). A key not in the given catalog is a custom "other" row.
 *  amount is rands-as-string (the grid's input shape). */
function rebuildRows(stored: ResumeState["incomeSources"], labelMap: Record<string, string>): IncomeRow[] {
  return stored.map((s, i) => ({
    key: s.key || `other_${i}`,
    label: s.label || labelMap[s.key] || "Other",
    amount: String(s.amount_cents / 100),
    period: (s.period as IncomePeriod) || "month",
    custom: !labelMap[s.key],
  }))
}
/** A resumed draft doesn't persist the chosen party type — infer it from the co-applicants. Company drafts
 *  (not persisted) resume as individual (the rare path); the applicant re-selects the type if needed. */
function inferType(cos: CoApplicant[]): ApplicantType {
  if (cos.some((c) => c.role === "guarantor")) return "guarantor"
  if (cos.some((c) => c.role === "co_applicant")) return "couple"
  return "individual"
}
/** Rebuild docFiles from the paths already in Storage — placeholders (uploaded:true) carry the real storagePath
 *  so they remain removable; the original filename/content is NOT re-rendered (POPIA — show "uploaded", a count). */
function seedDocFiles(income: IncomeRow[], employmentType: string, docPaths: { name: string; storagePath: string }[], idType?: string | null): Record<string, DocFile[]> {
  const cats = deriveDocCategories(incomeKeys(income), employmentType, idType)
  const out: Record<string, DocFile[]> = {}
  for (const p of docPaths) {
    const cat = categoryForFilename(p.name, cats)
    out[cat] = [...(out[cat] ?? []), { id: `resumed_${p.name}`, name: "Uploaded document", uploading: false, uploaded: true, storagePath: p.storagePath }]
  }
  return out
}

function tabClass(done: boolean, cur: boolean): string {
  // NB: don't use `.stoep` here — it sets padding-bottom:4px which overrides the button's pb-2.5 and drops the
  // active label below the others. The active underline is drawn as an absolute element instead (consistent pad).
  if (cur) return "font-medium text-[var(--ink)]"
  if (done) return "text-[var(--ink)]"
  return "text-[var(--ink-mute)]"
}
function circleClass(done: boolean, cur: boolean): string {
  if (done) return "bg-[var(--ink)] text-[var(--paper)]"
  if (cur) return "border-[1.5px] border-[var(--amber)] text-[var(--amber-ink)]"
  return "border-[1.5px] border-[var(--rule-strong)] text-[var(--ink-mute)]"
}

const ACTIVE_UNDERLINE = "linear-gradient(to right, currentColor 0 55%, var(--amber) 55% 80%, currentColor 80% 100%)"
const STEP_DESC: Record<string, string> = {
  "Personal details": "Your identity & contact",
  Finances: "Income & affordability",
  Documents: "ID, proof of address, payslips",
  "Application review": "Check & submit",
}

interface StepState { group: string; n: number; cur: boolean; done: boolean; reachable: boolean; desc: string | null; target: number | "apply-as" }

/** Per-step nav state over the linear `step` machine — shared by the desktop rail + the mobile bar. */
function computeStepStates(activeGroup: string, step: number, maxReached: number, inWizard: boolean, typePicked: boolean, hasApplication: boolean, applyAsDesc: string | null): StepState[] {
  const currentLinear = inWizard ? step : -1
  return STEP_GROUPS.map((g, gi) => {
    const applyAs = g === "Apply as"
    const panes = GROUP_PANES[g] ?? []
    const first = applyAs ? -1 : Math.min(...panes)
    const last = applyAs ? -1 : Math.max(...panes)
    const cur = g === activeGroup
    const done = applyAs ? (typePicked && !cur) : (currentLinear > last)
    const reachable = applyAs ? !hasApplication : (inWizard && first <= maxReached)
    return { group: g, n: gi + 1, cur, done, reachable, desc: applyAs ? applyAsDesc : (STEP_DESC[g] ?? null), target: applyAs ? "apply-as" : first }
  })
}

/** Desktop vertical step rail — the "listing space, transformed into navigation". The ACTIVE step auto-expands
 *  its sub-tabs as indented nav items (others stay collapsed). */
function StepRail({ states, step, maxReached, onNav, onJumpStep }: Readonly<{
  states: StepState[]; step: number; maxReached: number; onNav: (t: number | "apply-as") => void; onJumpStep: (s: number) => void
}>) {
  return (
    <nav className="flex flex-col gap-1">
      {states.map((s) => {
        const subPanes = GROUP_PANES[s.group] ?? []
        const expanded = s.cur && subPanes.length > 1
        return (
          <div key={s.group}>
            <button type="button" disabled={s.cur || !s.reachable} onClick={() => onNav(s.target)}
              className={`flex w-full items-start gap-3 rounded-[var(--r-button)] border-l-2 px-3 py-2.5 text-left transition-colors ${s.cur ? "border-[var(--amber)] bg-[var(--paper-sunk)]" : "border-transparent"} ${s.reachable && !s.cur ? "cursor-pointer hover:bg-[var(--paper-sunk)]/60" : "cursor-default"} ${!s.reachable && !s.cur && !s.done ? "opacity-50" : ""}`}>
              <span className={`mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] ${circleClass(s.done, s.cur)}`}>{s.done ? "✓" : s.n}</span>
              <span className="min-w-0">
                <span className={`block text-sm leading-tight ${s.cur || s.done ? "font-medium text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}>{s.group}</span>
                {s.desc && <span className="mt-0.5 block text-[11px] leading-tight text-[var(--ink-mute)]">{s.desc}</span>}
              </span>
            </button>
            {expanded && (
              <div className="ml-[26px] mt-0.5 flex flex-col gap-0.5 border-l border-[var(--rule)] pl-3">
                {subPanes.map((p) => {
                  const pcur = p === step
                  const preachable = p <= maxReached
                  return (
                    <button key={p} type="button" disabled={pcur || !preachable} onClick={() => onJumpStep(p)}
                      className={`rounded-[var(--r-button)] px-2 py-1 text-left text-[12px] transition-colors ${pcur ? "font-medium text-[var(--ink)]" : "text-[var(--ink-mute)]"} ${preachable && !pcur ? "cursor-pointer hover:text-[var(--ink)]" : "cursor-default"}`}>
                      {PANE_META[p].sub}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/** Mobile horizontal step bar (the Phase-1 nav, used below the lg breakpoint). */
function StepBar({ states, onNav }: Readonly<{ states: StepState[]; onNav: (t: number | "apply-as") => void }>) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-[var(--rule)]">
      {states.map((s) => (
        <button key={s.group} type="button" disabled={s.cur || !s.reachable} onClick={() => onNav(s.target)}
          className={`relative flex items-center gap-2 pb-2.5 text-[13px] ${tabClass(s.done, s.cur)} ${s.reachable && !s.cur ? "cursor-pointer" : "cursor-default"} ${!s.reachable && !s.cur && !s.done ? "opacity-60" : ""}`}>
          <span className={`flex size-[18px] items-center justify-center rounded-full text-[10px] ${circleClass(s.done, s.cur)}`}>{s.done ? "✓" : s.n}</span>
          {s.group}
          {s.cur && <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5" style={{ background: ACTIVE_UNDERLINE }} />}
        </button>
      ))}
    </div>
  )
}

/** Sub-tab pills for the active step (top of the form panel). Null when the step has ≤1 pane. */
function SubTabs({ activeGroup, step, maxReached, onJumpStep }: Readonly<{ activeGroup: string; step: number; maxReached: number; onJumpStep: (s: number) => void }>) {
  const subPanes = GROUP_PANES[activeGroup] ?? []
  if (subPanes.length <= 1) return null
  return (
    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--rule)]">
      {subPanes.map((s) => {
        const cur = s === step
        const reachable = s <= maxReached
        return (
          <button key={s} type="button" disabled={cur || !reachable} onClick={() => onJumpStep(s)}
            className={`relative pb-1.5 text-[12px] ${cur ? "font-medium text-[var(--ink)]" : "text-[var(--ink-mute)]"} ${reachable && !cur ? "cursor-pointer hover:text-[var(--ink)]" : "cursor-default"}`}>
            {PANE_META[s].sub}
            {cur && <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-[var(--amber)]" />}
          </button>
        )
      })}
    </div>
  )
}

export function StepPanel({ slug, orgId, listingTitle, leaseType, askingRentCents, prefill, resume, verifiedEmail, agentCard, listingCard }: Readonly<{
  slug: string; orgId: string; listingTitle?: string; leaseType: "residential" | "commercial"; askingRentCents: number
  prefill?: Partial<PartyFormState> | null
  resume?: ResumeState | null
  /** the logged-in visitor's account email (already confirmed) — if it matches, skip the email-OTP gate. */
  verifiedEmail?: string | null
  /** the agent card, rendered at the bottom of the desktop side column (full-page shell). */
  agentCard?: ReactNode
  /** the home being applied for — shown in the side column BEFORE begin; replaced by the step rail after. */
  listingCard?: ReactNode
}>) {
  const commercial = leaseType === "commercial"
  // Resuming a saved draft (the ?app&token link) rehydrates identity/income/employment/docs/co-applicants and
  // drops the applicant back on the step they left. Address isn't persisted by the apply flow, so it re-enters.
  const resumedIncome = resume ? rebuildRows(resume.incomeSources, INCOME_LABEL) : null
  const resumedCommitments = resume?.commitments ? rebuildRows(resume.commitments, COMMITMENT_LABEL) : null
  const [type, setType] = useState<ApplicantType | null>(resume ? (resume.applicantType ?? inferType(resume.coApplicants)) : null)
  const [step, setStep] = useState(resume?.step ?? 0)
  const [maxReached, setMaxReached] = useState(resume?.step ?? 0)

  // Seed identity from the resumed draft (else the logged-in user's own record; financial/employment stay empty
  // for a fresh start but rehydrate on resume).
  const [form, setForm] = useState<PartyFormState>({ idType: "sa_id", ...(prefill ?? {}), ...(resume?.form ?? {}) })
  const [errors, setErrors] = useState<PartyErrors>({})
  const [emp, setEmp] = useState<Emp>(resume?.emp ?? { employment_type: "", employer: "", start_date: "" })
  const [income, setIncome] = useState<IncomeRow[]>(resumedIncome ?? [])
  // Expenses sub-tab. Dependants split into adults (full living-floor cost) + minors (half); school fees are a
  // child-specific cost (offset by maintenance received). Commitments = the itemised debt/contractual grid.
  const resumedMinors = resume?.dependentMinors ?? resume?.dependents // legacy single count → minors
  const [dependentAdults, setDependentAdults] = useState(numStr(resume?.dependentAdults))
  const [dependentMinors, setDependentMinors] = useState(numStr(resumedMinors))
  const [commitments, setCommitments] = useState<IncomeRow[]>(resumedCommitments ?? [])
  const set: SetFn = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const [applicationId, setApplicationId] = useState<string | null>(resume?.applicationId ?? null)
  const [token, setToken] = useState<string | null>(resume?.token ?? null)
  const [busy, setBusy] = useState(false)
  // `saved` = the applicant has explicitly saved at least once (a resumed draft counts) → the CTA shows a green
  // tick. The save confirmation + copy link live in a modal, not the footer (which always shows the disclaimer).
  const [saved, setSaved] = useState<boolean>(!!resume)
  const [resumeLink, setResumeLink] = useState<string | null>(null)
  const [emailed, setEmailed] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [emailVerified, setEmailVerified] = useState<boolean>(resume?.emailVerified ?? false)

  const [coApplicants, setCoApplicants] = useState<CoApplicant[]>(resume?.coApplicants ?? [])
  const [company, setCompany] = useState<CompanyInfo>(resume?.company ?? { companyType: "", companyReg: "" })
  // "Add applicant" from the review (when affordability is short) — invite a co-applicant after the app exists.
  const [addApplicantOpen, setAddApplicantOpen] = useState(false)
  const [newCo, setNewCo] = useState<CoApplicant>(blankCo("co_applicant"))
  // "Begun" = past the "Apply as" landing and into the form panes. Lifted to a shared context (applyChrome) so the
  // top-header unit strip can render only once in the application. Resuming a saved draft starts already begun;
  // clicking "Apply as" in the rail re-opens the landing (begun→false) with the chosen type preserved.
  const { begun, setBegun } = useBegun()
  const [docFiles, setDocFiles] = useState<Record<string, DocFile[]>>(resume && resumedIncome ? seedDocFiles(resumedIncome, resume.emp.employment_type, resume.docPaths, resume.form?.idType) : {})
  const [docEscape, setDocEscape] = useState<Record<string, boolean>>({})
  const [consent, setConsent] = useState(false)
  const [screeningStatus, setScreeningStatus] = useState<ScreeningStatus>("idle")
  const [assessment, setAssessment] = useState<FreeAssessmentResult | null>(null)

  function advance(to: number) { setStep(to); setMaxReached((m) => Math.max(m, to)) }

  /** Navigate to a step, invalidating any cached free-assessment when leaving the review — so changes made on a
   *  data step force a fresh re-run on return instead of showing the stale review. (amendAt does the same for the
   *  in-review amend links.) Route ALL non-forward navigation (Back, rail, sub-tabs) through this. */
  function navTo(to: number) {
    if (to !== STEP_REVIEW) { setScreeningStatus("idle"); setAssessment(null) }
    setBegun(true)
    setStep(to)
  }

  // Pick an application type on the landing (no navigation — the landing stays until "Begin"). Co-applicant rows
  // are seeded for multi-party types so the inline capture has a first row; switching to individual clears them.
  function selectType(t: ApplicantType) {
    setType(t)
    // The card already says who they are, so force every row's role to match it (no per-row choice). Company
    // applies THROUGH its director(s) — capture them like couple (role co_applicant = the signatory on its behalf).
    if (t === "guarantor") setCoApplicants((cur) => (cur.length > 0 ? cur.map((c) => ({ ...c, role: "guarantor" as CoRole })) : [blankCo("guarantor")]))
    else if (t === "couple" || t === "company") setCoApplicants((cur) => (cur.length > 0 ? cur.map((c) => ({ ...c, role: "co_applicant" as CoRole })) : [blankCo("co_applicant")]))
    else setCoApplicants([]) // individual
  }

  /** Begin (first time) / Continue (re-editing "Apply as"): validate the chosen type + parties, then enter the
   *  form panes. Invites are held in state and dispatched once the application exists (createApplication). */
  function beginApplication() {
    if (!type) { toast.error("Choose how you're applying."); return }
    if (type === "company" && !company.companyType) { toast.error("Please select the company type."); return }
    if ((type === "couple" || type === "guarantor" || type === "company") && !(coApplicants[0] && coComplete(coApplicants[0]))) {
      toast.error(type === "company" ? "Add the director applying on the company's behalf." : "Add the co-applicant's name, email and ID number."); return
    }
    setBegun(true)
    setMaxReached((m) => Math.max(m, step))
  }

  function goBack() {
    if (step === 0) setBegun(false) // back from the first form pane → the "Apply as" landing (type preserved)
    else navTo(step - 1)
  }

  // Returning applicant on the landing: re-email their resume link. Anti-enumeration — the endpoint always
  // answers ok and only sends when a matching draft exists, so the toast is deliberately non-committal.
  async function resendResumeLink(email: string) {
    const e = email.trim()
    if (!e) { toast.error("Enter the email you applied with."); return }
    try {
      await fetch("/api/applications/resend-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, email: e }) })
    } catch { /* swallow — never reveal whether the email has a draft */ }
    toast.success("If a saved application exists for that email, we've emailed the link to continue.")
  }
  function loginToPrefill() { globalThis.location.href = `/login?redirect=${encodeURIComponent(`/apply/${slug}`)}` }

  function continueIdentity() {
    const e = validateIdentityCore("individual", form, true)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("Please complete the highlighted fields."); return }
    advance(1)
    autosave(1)
  }

  function continueAddress() {
    const e = validateAddressStep(form, true)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("A current address is required."); return }
    advance(2)
    autosave(2)
  }

  // Finances is three sub-tabs: Employment (status/employer/dependents) → Income (sources) → Expenses
  // (obligations). The application row is only CREATED leaving the last one (createApplication), so these two
  // advances just move forward (autosave is a no-op until the draft exists).
  function continueEmployment() {
    if (!emp.employment_type) { toast.error("Please select an employment status."); return }
    // (Re)seed the income grid from the chosen status — but only while nothing has been typed, so changing status
    // (e.g. → unemployed) refreshes the seed instead of leaving a stale "Salary" row, without clobbering entries.
    if (allAmountsEmpty(income)) setIncome(seedIncomeFor(emp.employment_type))
    advance(3)
    autosave(3)
  }

  function continueIncome() {
    // Pre-seed the commitments grid (the common 2–3) on first entry to Expenses, so it opens as a grid.
    seedIfEmpty(commitments, setCommitments, seedCommitments)
    advance(4)
    autosave(4)
  }

  // UPSERT the draft (create on first save, update thereafter — keyed on the held applicationId/token). Every
  // call EXTENDS the 30-day token server-side so a long document-gathering session isn't killed mid-edit. Shared
  // by createApplication (Income→Documents) and "Save & finish later". Email is required (to send the link).
  async function saveDraft(stepToSave: number, opts?: { explicit?: boolean; silent?: boolean }): Promise<{ id: string; url: string | null; emailed: boolean } | null> {
    if (!form.email) { if (!opts?.silent) { toast.error("Add your email first so we can send you a link to finish later.") } return null }
    const depA = intOrNull(dependentAdults)
    const depM = intOrNull(dependentMinors)
    const depTotal = (depA ?? 0) + (depM ?? 0)
    // School fees are entered as a commitment line but routed to the child bucket (offset by maintenance) — so the
    // declared obligations the read subtracts EXCLUDE them, and they're passed separately as school_fees.
    const schoolFeesCents = commitments.filter((r) => r.key === "school_fees").reduce((s, r) => s + rowMonthlyCents(r), 0)
    const commitMonthly = totalMonthlyCents(commitments) - schoolFeesCents
    try {
      const res = await fetch("/api/applications/save-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, applicationId, token, step: stepToSave, notify: !!opts?.explicit,
          first_name: form.firstName, last_name: form.lastName, email: form.email, phone: form.phone,
          id_type: form.idType || "sa_id", id_number: form.idNumber, date_of_birth: form.dob || "",
          employment_type: emp.employment_type, employer_name: emp.employer, employment_start_date: emp.start_date || "",
          employment_details: {
            contract_end_date: emp.contract_end_date || null, job_title: emp.job_title || null,
            employer_contact_name: emp.employer_contact_name || null, employer_contact_detail: emp.employer_contact_detail || null,
            business_name: emp.business_name || null, business_nature: emp.business_nature || null, trading_since: emp.trading_since || null,
            registered: emp.registered || null, sars_registered: emp.sars_registered || null,
          },
          dependent_adults: depA, dependent_minors: depM, dependents: posOrNull(depTotal),
          school_fees: posOrNull(schoolFeesCents / 100),
          // income_sources is the source of truth; gross_monthly_income (rands) is the derived total — the route
          // re-derives both from income_sources and stores gross_monthly_income_cents (cents).
          gross_monthly_income: String(totalMonthlyCents(income) / 100),
          income_sources: incomeSourcesPayload(income),
          // commitments grid → expenses jsonb; their monthly sum is the declared obligations the read subtracts.
          declared_monthly_obligations: posOrNull(commitMonthly / 100),
          expenses: incomeSourcesPayload(commitments),
          addresses: form.addresses ?? null,
          applicant_type: type,
          company_info: type === "company" ? company : null,
        }),
      })
      const json = await res.json() as { applicationId?: string; token?: string; resumeUrl?: string; emailed?: boolean; error?: string }
      if (!res.ok || !json.applicationId || !json.token) { if (!opts?.silent) { toast.error(json.error ?? "Could not save your progress.") } return null }
      setApplicationId(json.applicationId); setToken(json.token)
      // Put the resume token in the URL so a refresh / dev hot-reload rehydrates from the saved draft instead of
      // restarting (the draft is on the server; without the token in the URL the page can't find it on reload).
      try { globalThis.history?.replaceState(null, "", `?app=${json.applicationId}&token=${encodeURIComponent(json.token)}`) } catch { /* best-effort */ }
      return { id: json.applicationId, url: json.resumeUrl ?? null, emailed: !!json.emailed }
    } catch { if (!opts?.silent) { toast.error("Could not save your progress.") } return null }
  }

  // Per-step autosave: once a draft EXISTS (explicit save or the Income create), silently UPDATE it on every
  // step-advance so additional data is captured as you go — never CREATES a row on plain advance (no draft
  // spam from casual visitors), and never toasts/emails. Best-effort; the next save re-sends full state.
  function autosave(stepToSave: number) {
    if (applicationId && form.email) void saveDraft(stepToSave, { silent: true })
  }

  // Explicit "Save & finish later": persist + email the link, then surface the resume-link modal + mark saved.
  async function saveAndExit() {
    setBusy(true)
    try {
      const r = await saveDraft(step, { explicit: true })
      if (r) { setResumeLink(r.url); setEmailed(r.emailed); setSaved(true); setSaveModalOpen(true) }
    } finally { setBusy(false) }
  }

  async function createApplication() {
    // Employment status only — a R0 primary (student/dependent) applies with a guarantor whose income is
    // captured separately, so don't force an income figure here.
    if (!emp.employment_type) { toast.error("Please select an employment status."); return }
    setBusy(true)
    try {
      // On the FIRST create, email the resume link + toast — so the way-back is discoverable proactively, not
      // hidden behind a button. Subsequent passes are silent updates.
      const firstCreate = !applicationId
      const r = await saveDraft(STEP_DOCUMENTS, firstCreate ? { explicit: true } : undefined)
      if (!r) return
      void dispatchInvites(r.id)                // fire the held at-selection invites now the application exists
      if (firstCreate) {
        setSaved(true); setResumeLink(r.url); setEmailed(r.emailed)
        toast.success(r.emailed
          ? `Progress saved — we've emailed a link to ${form.email} to finish later.`
          : "Progress saved — you can finish later.")
      }
      advance(STEP_DOCUMENTS)
    } finally {
      setBusy(false)
    }
  }

  // Send every complete-but-not-yet-invited co-applicant (id_number links them to the application). Called at
  // create (the at-selection invites) and again from the Applicants step (any added there).
  async function dispatchInvites(appId: string) {
    const pending = coApplicants.filter((c) => !c.invited && coComplete(c))
    if (pending.length === 0) return
    for (const c of pending) {
      const res = await fetch(`/api/applications/${appId}/co-applicant`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone, id_number: c.idNumber, id_type: "sa_id", role: c.role }),
      })
      if (!res.ok) toast.error(`Could not invite ${c.email}`)
    }
    setCoApplicants((prev) => prev.map((c) => coComplete(c) ? { ...c, invited: true } : c))
  }

  // Invite an applicant added from the review (affordability boost). Adds + invites + re-runs the assessment.
  async function confirmAddApplicant() {
    if (!coComplete(newCo)) { toast.error("Add the applicant's name, email and ID number."); return }
    setBusy(true)
    try {
      if (applicationId) {
        const res = await fetch(`/api/applications/${applicationId}/co-applicant`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ first_name: newCo.firstName, last_name: newCo.lastName, email: newCo.email, phone: newCo.phone, id_number: newCo.idNumber, id_type: "sa_id", role: newCo.role }),
        })
        if (!res.ok) { toast.error("Could not invite the applicant. Please try again."); return }
      }
      setCoApplicants((prev) => [...prev, { ...newCo, invited: true }])
      setNewCo(blankCo("co_applicant")); setAddApplicantOpen(false)
      toast.success(`Invited ${newCo.email} — they'll get a link to add their part. We'll recheck once they're done.`)
      await submitApplication() // re-run the read; their income counts toward affordability once they finish
    } finally { setBusy(false) }
  }

  async function uploadDoc(categoryKey: string, file: File | null, single: boolean) {
    if (!file || !applicationId) return
    const fileId = `${categoryKey}_${crypto.randomUUID().slice(0, 8)}`
    const entry: DocFile = { id: fileId, name: file.name, uploading: true, uploaded: false, storagePath: null }
    setDocFiles((prev) => ({ ...prev, [categoryKey]: single ? [entry] : [...(prev[categoryKey] ?? []), entry] }))
    const patch = (p: Partial<DocFile>) => setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).map((f) => f.id === fileId ? { ...f, ...p } : f) }))

    // Format validation client-side (extension + MIME + magic bytes) — the same ADDENDUM_14L gate the agent
    // route uses; the applicant uploads straight to Storage, so enforce it here. Encrypted PDFs are NOT blocked:
    // the server pipeline decrypts empty-password files (the common bank-statement case) before extraction.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const check = validateUpload(file.name, file.type, bytes)
    if (!check.valid) { patch({ uploading: false, error: check.userMessage ?? "File not accepted." }); toast.error(check.userMessage?.split("\n")[0] ?? "File not accepted."); return }

    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "pdf"
      const path = `applications/${orgId}/${applicationId}/${single ? categoryKey : fileId}.${ext}`
      const { error: upErr } = await supabase.storage.from("application-docs").upload(path, file, { upsert: true })
      if (upErr) throw upErr
      let detection: string | null = null
      try {
        const res = await fetch(`/api/applications/${applicationId}/detect-document`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, docKey: categoryKey }),
        })
        if (res.ok) {
          detection = ((await res.json()) as { summary?: string }).summary ?? null
        } else if (res.status === 422) {
          // A genuinely password-locked PDF — remove the just-uploaded file and tell the applicant to re-save it.
          const b = await res.json().catch(() => ({})) as { message?: string }
          const msg = b.message ?? "This file is password-protected — please upload an unprotected version."
          try { await supabase.storage.from("application-docs").remove([path]) } catch { /* best-effort */ }
          patch({ uploading: false, error: msg })
          toast.error(msg)
          return
        }
      } catch { /* detection non-fatal */ }
      patch({ uploading: false, uploaded: true, storagePath: path, detection })
    } catch (err) {
      patch({ uploading: false, error: err instanceof Error ? err.message : "Upload failed" })
    }
  }

  async function removeDoc(categoryKey: string, fileId: string) {
    const f = (docFiles[categoryKey] ?? []).find((x) => x.id === fileId)
    setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).filter((x) => x.id !== fileId) }))
    // Delete from Storage too — the /screen pipeline enumerates the whole prefix, so a removed file must go.
    if (f?.storagePath) { try { await createClient().storage.from("application-docs").remove([f.storagePath]) } catch { /* best-effort */ } }
  }
  function renameDoc(categoryKey: string, fileId: string, name: string) {
    setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).map((f) => f.id === fileId ? { ...f, name } : f) }))
  }

  async function finishDocuments() {
    if (!applicationId) return
    setBusy(true)
    try {
      // Back-compat: store the first main bank-statement path. The real extraction is the /screen pipeline,
      // which enumerates EVERY uploaded file — so multi-file categories flow through with no extra wiring.
      const bankPath = (docFiles["bank_main"] ?? []).find((f) => f.uploaded)?.storagePath ?? null
      await createClient().from("applications").update({ bank_statement_path: bankPath, stage1_status: "documents_submitted" }).eq("id", applicationId)
      advance(STEP_REVIEW)
      autosave(STEP_REVIEW) // persist draft_step so a refresh/resume lands back on the review, not Documents
    } finally {
      setBusy(false)
    }
  }

  // Documents is two sub-tabs: Required (the gating core) → Optional (strengtheners). Required→Optional just
  // advances once the required docs are satisfied; finishDocuments runs leaving Optional → Applicants.
  function continueDocsRequired() { advance(STEP_DOCS_OPTIONAL); autosave(STEP_DOCS_OPTIONAL) }

  /** Amend the application (add applicant / upload docs / edit details) → re-enter that step; the user
   *  re-submits to run a fresh screening iteration (the 14M self-improvement loop). */
  function amendAt(toStep: number) { setScreeningStatus("idle"); setAssessment(null); setStep(toStep) }

  /** Run the Step-1 FREE assessment (zero-AI, instant) and show the result. NO deep scan, NO poll — the deep
   *  scan runs later, at the agent's shortlist step. The assessment can be re-run freely (it's free). */
  async function submitApplication() {
    if (!applicationId || !token) return
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
      const json = await res.json() as { ok?: boolean; error?: string; code?: string; freeAssessment?: FreeAssessmentResult }
      if (!res.ok || !json.ok || !json.freeAssessment) {
        // If the email changed since verifying, the server clears the gate — re-show "Verify your email".
        if (json.code === "email_unverified") setEmailVerified(false)
        toast.error(json.error ?? "Could not run your assessment."); return
      }
      setAssessment(json.freeAssessment); setScreeningStatus("done")
    } catch {
      toast.error("Could not run your assessment.")
    } finally {
      setBusy(false)
    }
  }

  const docCategories = deriveDocCategories(incomeKeys(income), emp.employment_type, form.idType)
  // A required doc is satisfied when uploaded, OR — if it offers an escape ("I don't have a payslip") — when the
  // applicant takes that escape. ID + bank statements have no escape, so they're the true hard uploads.
  const docsReady = docCategories.filter((c) => c.required).every((c) => (docFiles[c.key] ?? []).some((f) => f.uploaded) || (!!c.escapeLabel && !!docEscape[c.key]))
    && !Object.values(docFiles).flat().some((f) => f.uploading)
  const companyOk = type !== "company" || Boolean(company.companyType)
  // Submit gate: every applicant "green" — primary is implicit, each co-applicant has name+email+id (or is
  // already invited), and a company application has its type captured.
  const applicantsGreen = companyOk && coApplicants.every((c) => c.invited || coComplete(c))
  // Email gate satisfied if they verified by OTP OR they're the logged-in owner of this email (already confirmed).
  const emailGateSatisfied = emailVerified || (!!verifiedEmail && !!form.email && form.email.toLowerCase() === verifiedEmail.toLowerCase())
  // The footer ALWAYS shows the pre-selection disclaimer — the save confirmation lives in the modal, not here.
  const disclaimer = "Pre-selection only — affordability and shortlisting. No credit check or bureau enquiry runs at this stage — only after you submit and give explicit consent."
  const scrollCls = "flex-1 py-3 [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:overflow-y-auto"
  // Two-level nav state: "Apply as" is the landing (type + parties + returning); the form panes (step 0–7) group
  // into Personal details / Finances / Documents / Application review via PANE_META. inWizard = past the landing.
  const inWizard = begun
  const activeGroup = inWizard ? PANE_META[step].group : "Apply as"
  const headerSub = inWizard ? PANE_META[step].sub : "Pre-selection"
  const applyAsDesc = type ? `${TYPE_LABEL[type]} · ${leaseType}` : "Choose how you apply"
  const navStates = computeStepStates(activeGroup, step, maxReached, inWizard, type !== null, !!applicationId, applyAsDesc)
  const onNav = (t: number | "apply-as") => { if (t === "apply-as") setBegun(false); else navTo(t) }
  // The current step's forward action — rendered in the panel header (intermediate = "Next →"; the final
  // review/submit uses the primary style). Back + Save live alongside it; the footer keeps only the disclaimer.
  const navNext = ((): { label: string; onClick: () => void; disabled?: boolean; primary?: boolean } | null => {
    if (!inWizard) return null
    if (step === 0) return { label: "Next", onClick: continueIdentity }
    if (step === 1) return { label: "Next", onClick: continueAddress }
    if (step === 2) return { label: "Next", onClick: continueEmployment }
    if (step === 3) return { label: "Next", onClick: continueIncome }
    if (step === STEP_EXPENSES) return { label: "Next", onClick: createApplication }
    if (step === STEP_DOCUMENTS) return { label: "Next", onClick: continueDocsRequired, disabled: !docsReady }
    if (step === STEP_DOCS_OPTIONAL) return { label: "Next", onClick: finishDocuments }
    // Review has NO header action — its "Continue to review" / "Submit" buttons live in the page body. The header
    // keeps only the Back button.
    return null
  })()
  const showBackBtn = inWizard
  const showSaveBtn = inWizard && !!form.email && step <= LAST_DATA_STEP && screeningStatus === "idle"
  // Desktop = vertical step rail (left) + form panel; mobile/short = horizontal step bar atop the panel.
  // NB: the [@media …] variant must be written out literally on each class — Tailwind never generates CSS for
  // a variant assembled from a template literal (it only scans complete class strings in source).

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:flex-row [@media(min-width:1024px)_and_(min-height:700px)]:items-stretch">
      {/* Desktop side column — the home being applied for BEFORE begin, then the step rail once begun (+ agent
          anchored at the bottom either way). */}
      <aside className="hidden shrink-0 [@media(min-width:1024px)_and_(min-height:700px)]:flex [@media(min-width:1024px)_and_(min-height:700px)]:w-[300px] [@media(min-width:1024px)_and_(min-height:700px)]:flex-col [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
        {begun ? (
          /* Rail card FILLS the column (fixed outer height → expanding the accordion never shifts the layout). Its
             BODY scrolls, so on a short viewport the steps stay reachable instead of overflowing out of view. */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
            <div className="flex shrink-0 items-center border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
                <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
                Your application
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2"><StepRail states={navStates} step={step} maxReached={maxReached} onNav={onNav} onJumpStep={navTo} /></div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{listingCard}</div>
        )}
        {/* Agent card — fixed, anchored below the side column. */}
        {agentCard && <div className="mt-4 shrink-0">{agentCard}</div>}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
      <div className="fs-panel mb-1.5 flex flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0" style={{ maxWidth: "none", width: "100%" }}>

        {/* Mobile/short: horizontal step bar + sub-tabs (on desktop the rail handles both) */}
        <div className="[@media(min-width:1024px)_and_(min-height:700px)]:hidden">
          <StepBar states={navStates} onNav={onNav} />
          {inWizard && <SubTabs activeGroup={activeGroup} step={step} maxReached={maxReached} onJumpStep={navTo} />}
        </div>

        {/* Panel header — mirrors the rail's "Your application" header (amber tick + step · section) so the rule
            continues across the nav and the panel. Shows on the landing too ("Apply as · Pre-selection"). */}
        {/* The side column differs by state — landing = listing DetailCard, wizard = the step-rail card — and
            their headers sit at slightly different heights, so the panel header needs a per-state top offset. */}
        <div className={`mb-3 flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-2.5 ${begun ? "[@media(min-width:1024px)_and_(min-height:700px)]:-mt-6" : "[@media(min-width:1024px)_and_(min-height:700px)]:-mt-[18px]"}`}>
            <h2 className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--ink)]">
              <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
              <span className="truncate">{activeGroup}<span className="font-normal text-[var(--ink-mute)]"> · {headerSub}</span></span>
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              {showBackBtn && (
                <ActionButton tone="secondary" size="sm" icon={<ArrowLeft className="size-4" />} onClick={goBack} disabled={busy || (step === 0 && !!applicationId)}>Back</ActionButton>
              )}
              {navNext && (
                <ActionButton tone={navNext.primary ? "primary" : "secondary"} size="sm" onClick={navNext.onClick} disabled={busy || navNext.disabled} className="whitespace-nowrap">
                  {navNext.primary ? navNext.label : <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{navNext.label} <ArrowRight className="size-4" /></span>}
                </ActionButton>
              )}
              {/* Two distinct things: a QUIET passive status (auto-save reassurance) + a LABELLED action that
                  actually emails the resume link (the real way back). Don't let the tick masquerade as the action. */}
              {saved && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[var(--ink-mute)]" title="Your progress is saved on our servers">
                  <CheckCircle2 className="size-3.5" /> Saved
                </span>
              )}
              {showSaveBtn && (
                <ActionButton tone="secondary" size="sm" icon={<Clock className="size-4" />} onClick={saveAndExit} disabled={busy} className="whitespace-nowrap" title="Save & email a link to finish later">
                  {saved ? "Continue later" : "Save & finish later"}
                </ActionButton>
              )}
            </div>
          </div>

        {!begun && (
          <div className={scrollCls}>
            <ApplyAsPane
              listingTitle={listingTitle} commercial={commercial} type={type} onSelect={selectType}
              coApplicants={coApplicants} setCoApplicants={setCoApplicants} company={company} setCompany={setCompany}
              loggedInEmail={verifiedEmail ?? null} onResend={resendResumeLink} onLogin={loginToPrefill}
              onBegin={beginApplication} resuming={!!resume} busy={busy}
            />
          </div>
        )}

        {begun && type !== null && (
          <>
            <div className={scrollCls}>
              {step === 0 && <StepPersonal type={type} commercial={commercial} form={form} set={set} errors={errors} />}
              {step === 1 && <StepAddress form={form} set={set} errors={errors} />}
              {step === 2 && <StepEmployment emp={emp} setEmp={setEmp} />}
              {step === 3 && <StepIncome income={income} setIncome={setIncome} variable={SELF_EMPLOYED_TYPES.includes(emp.employment_type) || emp.employment_type === "commission"} />}
              {step === STEP_EXPENSES && <StepExpenses dependentAdults={dependentAdults} setDependentAdults={setDependentAdults} dependentMinors={dependentMinors} setDependentMinors={setDependentMinors} commitments={commitments} setCommitments={setCommitments} />}
              {step === STEP_DOCUMENTS && <StepDocuments tab="required" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />}
              {step === STEP_DOCS_OPTIONAL && <StepDocuments tab="optional" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />}
              {step === STEP_REVIEW && <StepSubmit form={form} emp={emp} income={income} askingRentCents={askingRentCents} consent={consent} setConsent={setConsent} coApplicants={coApplicants} applicantsGreen={applicantsGreen} screeningStatus={screeningStatus} assessment={assessment} onAmend={amendAt} onRerun={submitApplication} onContinue={submitApplication} onAddApplicant={() => setAddApplicantOpen(true)} applicationId={applicationId} token={token} emailVerified={emailGateSatisfied} onVerified={() => setEmailVerified(true)} />}
            </div>
          </>
        )}

        {/* Footer — the disclaimer only (nav buttons live in the panel header now), pinned to the bottom. The
            negative bottom margin pulls it into the fs-panel's 42px bottom padding so its gap from the panel edge
            matches the header's gap from the top. */}
        <div className="mt-auto flex shrink-0 items-start gap-3 border-t border-[var(--rule)] pt-4 [@media(min-width:1024px)_and_(min-height:700px)]:-mb-8">
          <span className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--ink-soft)]">
            <span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: "var(--positive, #2f9e63)" }} />
            {disclaimer}
          </span>
        </div>
      </div>

      {/* Agent contact on mobile/short (the desktop rail that holds it is hidden here) */}
      {agentCard && <div className="mt-4 [@media(min-width:1024px)_and_(min-height:700px)]:hidden">{agentCard}</div>}

      {/* Resume-link confirmation modal — shown after an explicit Save & finish later. */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setSaveModalOpen(false)}>
          <div className="w-full max-w-md rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
              <CheckCircle2 className="size-5 text-emerald-600" /> Saved — here&apos;s your link to continue
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
              {emailed
                ? <>This link is how you pick up where you left off — from any device, any time. We&apos;ve emailed it to <strong className="text-[var(--ink)]">{form.email}</strong>; copy it below too if you like.</>
                : <>This link is how you pick up where you left off — from any device, any time. Copy it below and keep it somewhere safe.</>}
            </p>
            {resumeLink && (
              <div className="mt-3 flex items-center gap-2">
                <input readOnly value={resumeLink} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-2.5 py-1.5 text-xs text-[var(--ink-soft)]" />
                <ActionButton tone="secondary" onClick={() => { void navigator.clipboard?.writeText(resumeLink); toast.success("Resume link copied.") }}>Copy</ActionButton>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <ActionButton tone="primary" onClick={() => setSaveModalOpen(false)}>Done</ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Add-applicant modal — invited from the review when affordability is short. */}
      {addApplicantOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setAddApplicantOpen(false)}>
          <div className="w-full max-w-md rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[var(--ink)]">Add an applicant</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--ink-soft)]">We&apos;ll email them a secure link to add their own details, documents and consent. Their income counts toward affordability once they finish their part.</p>
            <div className="mt-3 flex flex-col gap-2">
              <FieldGrid>
                <TextField label="First name" value={newCo.firstName} onChange={(v) => setNewCo({ ...newCo, firstName: v })} required />
                <TextField label="Last name" value={newCo.lastName} onChange={(v) => setNewCo({ ...newCo, lastName: v })} />
                <TextField label="Email" type="email" value={newCo.email} onChange={(v) => setNewCo({ ...newCo, email: v })} required />
                <TextField label="ID number" value={newCo.idNumber} onChange={(v) => setNewCo({ ...newCo, idNumber: v })} required />
              </FieldGrid>
              <SelectField label="They are" value={newCo.role} onChange={(v) => setNewCo({ ...newCo, role: v as CoRole })} options={[{ value: "co_applicant", label: "A co-applicant (lives here / on the lease)" }, { value: "guarantor", label: "A guarantor / surety (backs the rent)" }]} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <ActionButton tone="secondary" onClick={() => setAddApplicantOpen(false)} disabled={busy}>Cancel</ActionButton>
              <ActionButton tone="primary" icon={<Users className="size-4" />} onClick={confirmAddApplicant} disabled={busy}>Invite applicant</ActionButton>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  )
}

// ── Landing ("Apply as") — iconic header + returning + how-it-works + the type cards ──────────────
function SectionEyebrow({ n, label }: Readonly<{ n: string; label: string }>) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-mute)]">{n} · {label}</span>
      <span aria-hidden className="h-px flex-1 bg-[var(--rule)]" />
    </div>
  )
}

function ApplyAsPane({ listingTitle, commercial, type, onSelect, coApplicants, setCoApplicants, company, setCompany, loggedInEmail, onResend, onLogin, onBegin, resuming, busy }: Readonly<{
  listingTitle?: string; commercial: boolean; type: ApplicantType | null; onSelect: (t: ApplicantType) => void
  coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
  company: CompanyInfo; setCompany: (v: CompanyInfo) => void
  loggedInEmail: string | null; onResend: (email: string) => void; onLogin: () => void
  onBegin: () => void; resuming: boolean; busy?: boolean
}>) {
  const [retEmail, setRetEmail] = useState("")
  // couple / guarantor / company all capture people inline; company also captures the business above them.
  const parties = type === "couple" || type === "guarantor" || type === "company"
  const updateCo = (i: number, patch: Partial<CoApplicant>) => setCoApplicants(coApplicants.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const addCo = () => setCoApplicants([...coApplicants, blankCo(type === "guarantor" ? "guarantor" : "co_applicant")])
  const removeCo = (i: number) => setCoApplicants(coApplicants.filter((_, j) => j !== i))
  let firstPartyLabel = commercial ? "a partner" : "a co-applicant"
  if (type === "guarantor") firstPartyLabel = commercial ? "a surety" : "a guarantor"
  else if (type === "company") firstPartyLabel = "a director"
  const addLabel = coApplicants.length > 0 ? "another" : firstPartyLabel
  const partyNote = type === "company"
    ? "A company applies through its director(s) — add who signs on its behalf. Each gets their own secure link."
    : "Each person gets their own secure link to consent & load documents."

  return (
    <div className="flex min-h-full flex-col gap-7">
      {/* Intro — the panel header bar above already carries "Apply as · Pre-selection". */}
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[var(--ink)]">Apply to rent {listingTitle ?? "this home"}.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-soft)]">A short pre-selection so the agent can shortlist applicants. It&apos;s free, there&apos;s no credit check at this stage, and you can save and finish whenever suits you.</p>
      </div>

      {/* 01 · Returning */}
      <section className="flex flex-col gap-3">
        <SectionEyebrow n="01" label="Returning?" />
        {loggedInEmail ? (
          <div className="flex items-center gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] px-4 py-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span className="text-[var(--ink-soft)]">Signed in as <span className="font-medium text-[var(--ink)]">{loggedInEmail}</span> — your details will pre-fill.</span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Continue a saved application */}
            <div className="flex flex-col gap-1.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4">
              <p className="text-sm font-medium text-[var(--ink)]">Continue a saved application</p>
              <p className="text-xs leading-relaxed text-[var(--ink-soft)]">Enter your email and we&apos;ll resend the link to pick up where you left off.</p>
              <div className="mt-auto flex gap-2 pt-2">
                <input type="email" value={retEmail} onChange={(e) => setRetEmail(e.target.value)} placeholder="you@email.com"
                  className="min-w-0 flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1.5 text-sm text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none" />
                <ActionButton tone="secondary" size="sm" onClick={() => onResend(retEmail)}>Resend</ActionButton>
              </div>
            </div>
            {/* Log in to pre-fill */}
            <div className="flex flex-col gap-1.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4">
              <p className="text-sm font-medium text-[var(--ink)]">Already a Pleks tenant?</p>
              <p className="text-xs leading-relaxed text-[var(--ink-soft)]">Log in and we&apos;ll pre-fill your details — no need to re-enter everything you&apos;ve told us before.</p>
              <div className="mt-auto pt-2"><ActionButton tone="secondary" size="sm" icon={<LogIn className="size-4" />} onClick={onLogin}>Log in to pre-fill</ActionButton></div>
            </div>
          </div>
        )}
      </section>

      {/* 02 · How are you applying */}
      <section className="flex flex-col gap-3">
        <SectionEyebrow n="02" label="How are you applying?" />
        <div className="grid gap-3 sm:grid-cols-2 [@media(min-width:1024px)_and_(min-height:700px)]:grid-cols-4">
          {typesFor(commercial).map((c) => {
            const selected = type === c.id
            return (
              <button key={c.id} type="button" onClick={() => onSelect(c.id)}
                className={`group flex flex-col items-start gap-2 rounded-[var(--r-button)] border bg-[var(--paper-raised)] p-3 text-left transition-colors ${selected ? "border-[var(--amber)] ring-1 ring-[var(--amber)]" : "border-[var(--rule)] hover:border-[var(--amber)]"}`}>
                <span className={`flex size-8 items-center justify-center rounded-[var(--r-button)] ${selected ? "bg-[var(--amber)] text-[var(--paper)]" : "bg-[var(--amber-wash)] text-[var(--amber-ink)]"}`}><c.icon className="size-[18px]" /></span>
                <span className="text-sm font-semibold leading-snug text-[var(--ink)]">{c.title}</span>
                <span className="text-[11px] leading-snug text-[var(--ink-soft)]">{c.blurb}</span>
              </button>
            )
          })}
        </div>

        {/* Inline capture — one grey block. Couple → co-applicants · guarantor → guarantors · company → the
            business (type + reg) PLUS the director(s) signing on its behalf. Compact rows so it doesn't scroll. */}
        {parties && (
          <div className="flex flex-col gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
            {type === "company" && (
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={company.companyType} onChange={(e) => setCompany({ ...company, companyType: e.target.value })}
                  className="min-w-[120px] flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none">
                  {COMPANY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value === "" ? "Company type…" : o.label}</option>)}
                </select>
                <input placeholder="Registration number (if any)" value={company.companyReg} onChange={(e) => setCompany({ ...company, companyReg: e.target.value })} className={CO_INPUT} />
              </div>
            )}
            {type === "company" && <p className="mt-1 text-xs font-medium text-[var(--ink)]">Who&apos;s applying on the company&apos;s behalf?</p>}
            {coApplicants.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <input placeholder="First name" value={c.firstName} onChange={(e) => updateCo(i, { firstName: e.target.value })} className={CO_INPUT} />
                <input placeholder="Last name" value={c.lastName} onChange={(e) => updateCo(i, { lastName: e.target.value })} className={CO_INPUT} />
                <input type="email" placeholder="Email" autoComplete="off" value={c.email} onChange={(e) => updateCo(i, { email: e.target.value })} className={CO_INPUT} />
                <input placeholder="ID number" value={c.idNumber} onChange={(e) => updateCo(i, { idNumber: e.target.value })} className={CO_INPUT} />
                {coApplicants.length > 1 && <button type="button" onClick={() => removeCo(i)} aria-label="Remove this person" className="shrink-0 text-[var(--ink-mute)] transition-colors hover:text-red-600"><X className="size-4" /></button>}
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={addCo}
                className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
                <Plus className="size-4" /> Add {addLabel}
              </button>
              <span className="text-[11px] text-[var(--ink-mute)]">{partyNote}</span>
            </div>
          </div>
        )}
      </section>

      {/* Begin — bottom-right, same primary action style as Submit. */}
      <div className="mt-auto flex justify-end pt-3">
        <ActionButton tone="primary" disabled={busy || !type} onClick={onBegin}>
          <span className="inline-flex items-center gap-1.5">{resuming ? "Continue" : "Begin your application"} <ArrowRight className="size-4" /></span>
        </ActionButton>
      </div>
    </div>
  )
}

function StepHeading({ title, sub, subOnly }: Readonly<{ title: string; sub: string; subOnly?: boolean }>) {
  // subOnly = the panel header already shows the title (step · section), so render just the info line.
  if (subOnly) return <p className="text-sm text-[var(--ink-soft)]">{sub}</p>
  return (
    <div>
      <h2 className="text-xl font-medium tracking-[-0.01em] text-[var(--ink)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">{sub}</p>
    </div>
  )
}

// ── Step 1 — Personal details ────────────────────────────────────────────────────
function StepPersonal({ type, commercial, form, set, errors }: Readonly<{ type: ApplicantType; commercial: boolean; form: PartyFormState; set: SetFn; errors: PartyErrors }>) {
  let sub: string
  if (type === "company") sub = "Your own details as the contact for the company (a director/signatory). SA ID auto-fills date of birth and gender."
  else if (type === "guarantor") sub = commercial ? "First, the party who'll occupy the premises. You'll add the surety next." : "First, the person who'll live here (the tenant). You'll add the guarantor next."
  else sub = "The main applicant's details. SA ID auto-fills date of birth and gender."
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">{sub}</p>
      <IndividualIdentity f={form} set={set} errors={errors} fullFica sectioned />
    </div>
  )
}

// ── Step 2 — Address ─────────────────────────────────────────────────────────────
// Three fixed sections (Current · Postal · Billing) — no add/remove buttons. Current is required; the rest are
// optional. Each section edits the address of its type in the form.addresses array.
const ADDRESS_SECTIONS = [
  { type: "physical", n: "01", title: "Current address", required: true },
  { type: "postal", n: "02", title: "Postal address", required: false },
  { type: "billing", n: "03", title: "Billing address", required: false },
] as const

function StepAddress({ form, set, errors }: Readonly<{ form: PartyFormState; set: SetFn; errors: PartyErrors }>) {
  type Addr = NonNullable<PartyFormState["addresses"]>[number]
  const addresses: Addr[] = form.addresses ?? []
  function addrOf(type: Addr["type"]): Addr { return addresses.find((a) => a.type === type) ?? ({ type } as Addr) }
  function setAddr(type: Addr["type"], patch: Partial<Addr>) {
    const has = addresses.some((a) => a.type === type)
    set("addresses", has ? addresses.map((a) => (a.type === type ? { ...a, ...patch } : a)) : [...addresses, { type, ...patch } as Addr])
  }
  const hasData = (type: string) => addresses.some((a) => a.type === type && !!(a.streetNumber || a.streetName || a.line1 || a.suburb || a.city || a.postal))
  // Desktop shows all three sections; mobile shows only Current, revealing Postal/Billing on demand (kind to a
  // small screen). Optional sections that already carry data (resume) start open so nothing is hidden.
  const [openOptional, setOpenOptional] = useState<Set<string>>(() => new Set(ADDRESS_SECTIONS.filter((s) => !s.required && hasData(s.type)).map((s) => s.type)))
  const closedOptional = ADDRESS_SECTIONS.filter((s) => !s.required && !openOptional.has(s.type))
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">Where you live now, plus a postal or billing address if they differ. Current address is required — the rest are optional.</p>
      {ADDRESS_SECTIONS.map((s) => {
        const shown = s.required || openOptional.has(s.type)
        return (
          <section key={s.type} className={shown ? "" : "hidden lg:block"}>
            <SectLabel n={s.n}>{s.title}{!s.required && <span className="font-normal normal-case text-[var(--ink-mute)]"> · optional</span>}</SectLabel>
            <AddressFields address={addrOf(s.type)} onUpdate={(p) => setAddr(s.type, p)} requiredLine={s.required} />
            {s.required && errors.addresses && <p className="mt-2 text-xs text-destructive">{errors.addresses}</p>}
          </section>
        )
      })}
      {/* Mobile only — reveal an optional section. On desktop all three are already shown, so this is hidden. */}
      {closedOptional.length > 0 && (
        <div className="flex flex-wrap gap-2 lg:hidden">
          {closedOptional.map((s) => (
            <button key={s.type} type="button" onClick={() => setOpenOptional((prev) => new Set(prev).add(s.type))}
              className="inline-flex w-fit items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
              <Plus className="size-4" /> Add {s.title.toLowerCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Finances — three sub-tabs: Employment · Income · Expenses ─────────────────────
// Compact "excel" cell inputs (Income) — theme tokens; the native period <select> popup is themed light on the
// public surface by the global .pleks-public select rule (app/globals.css). Flex-wrap so the row stacks on a
// 360px phone (label on its own line, amount + period below) rather than overflowing a rigid grid.
const CELL_BASE = "rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-mute)] focus:border-[var(--amber)] focus:outline-none"
const CELL = `${CELL_BASE} px-2.5`
const CELL_SELECT = `${CELL} appearance-none`
// The amount value WITHOUT the "R" — the R is pinned to the field's left, the number right-aligns. (en-ZA spaces.)
const fmtRands = (cents: number) => formatZAR(cents).replace(/^R\s*/u, "")

// Finances · Employment — the status branches into employer / business / minimal context. The income figure
// itself lives in the Income sub-tab; this section is the context that qualifies it (and routes the evidence ask).
const HINT_INFO = "rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-xs text-[var(--ink-soft)]"
const HINT_AMBER = "rounded-[var(--r-button)] border border-[var(--amber)] bg-[var(--amber-wash)] px-3 py-2 text-xs text-[var(--amber-ink)]"
function StepEmployment({ emp, setEmp }: Readonly<{ emp: Emp; setEmp: (v: Emp) => void }>) {
  const set = (patch: Partial<Emp>) => setEmp({ ...emp, ...patch })
  const t = emp.employment_type
  const employed = EMPLOYED_TYPES.includes(t)
  const selfEmployed = SELF_EMPLOYED_TYPES.includes(t)
  const probation = employed && startedWithinProbation(emp.start_date)
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">Where your income comes from — the context that qualifies your income figure. Affordability is judged on this plus your income and expenses; none of it triggers a credit check at this stage.</p>
      <div className="flex flex-col gap-4">
        <FieldGrid>
          <SelectField label="Employment status" value={t} onChange={(v) => set({ employment_type: v })} required options={EMPLOYMENT_OPTIONS} />
        </FieldGrid>

        {employed && (
          <>
            <FieldGrid>
              <TextField label="Employer name" value={emp.employer} onChange={(v) => set({ employer: v })} placeholder="Company name" />
              <TextField label="Employment start date" type="date" value={emp.start_date} onChange={(v) => set({ start_date: v })} />
              {t === "contract" && <TextField label="Contract end date" type="date" value={emp.contract_end_date ?? ""} onChange={(v) => set({ contract_end_date: v })} />}
              <TextField label="Job title (optional)" value={emp.job_title ?? ""} onChange={(v) => set({ job_title: v })} placeholder="e.g. Accountant" />
            </FieldGrid>
            <FieldGrid>
              <TextField label="Employer contact name (optional)" value={emp.employer_contact_name ?? ""} onChange={(v) => set({ employer_contact_name: v })} placeholder="HR or manager" />
              <TextField label="Employer contact (optional)" value={emp.employer_contact_detail ?? ""} onChange={(v) => set({ employer_contact_detail: v })} placeholder="Phone or email" />
            </FieldGrid>
            {t === "contract" && !!emp.contract_end_date && (
              <p className={HINT_INFO}>A fixed-term contract that ends before the lease runs out is an income-continuity signal the agent weighs — it doesn&apos;t decline you on its own.</p>
            )}
            {probation && (
              <p className={HINT_AMBER}>Started under {PROBATION_MONTHS} months ago — possibly still in a probation period. The agent sees this as context; it doesn&apos;t affect your score on its own.</p>
            )}
          </>
        )}

        {selfEmployed && (
          <>
            <FieldGrid>
              <TextField label="Business name" value={emp.business_name ?? ""} onChange={(v) => set({ business_name: v })} placeholder="Trading name" />
              <TextField label="Nature of business" value={emp.business_nature ?? ""} onChange={(v) => set({ business_nature: v })} placeholder="e.g. Consulting" />
              <TextField label="Trading since" type="date" value={emp.trading_since ?? ""} onChange={(v) => set({ trading_since: v })} />
            </FieldGrid>
            <FieldGrid>
              <SelectField label="Registered?" value={emp.registered ?? ""} onChange={(v) => set({ registered: v })} options={REGISTERED_OPTIONS} />
              <SelectField label="SARS-registered?" value={emp.sars_registered ?? ""} onChange={(v) => set({ sars_registered: v })} options={YESNO_OPTIONS} />
            </FieldGrid>
            <p className={HINT_INFO}>At the deep scan we&apos;ll ask for 6 months&apos; business and personal bank statements, plus your SARS Tax Compliance Status or ITA34 if registered.</p>
          </>
        )}

        {t === "retired" && <p className={HINT_INFO}>Add your pension or annuity as an income source in the next tab — that&apos;s all we need here.</p>}
        {t === "grant" && <p className={HINT_INFO}>Add your grant (e.g. the SASSA grant type) as an income source in the next tab — that&apos;s all we need here.</p>}
        {t === "unemployed" && <p className={HINT_INFO}>That&apos;s fine to declare. List any other income in the next tab, or apply with a co-applicant or guarantor whose income carries the application.</p>}
      </div>
    </div>
  )
}

// A reusable itemised line-item grid (income sources AND expense commitments use the SAME form): a header row,
// removable rows (label · R-amount · period), an empty-state, and a grouped "+ Add" picker. Speculative rows are
// desktop-only-until-used. Grows from a seed + picker — never a wall of empty rows (kind to a budget Android).
const PICKER_CHIP = "rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1 text-xs text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--rule)] disabled:hover:text-[var(--ink-soft)]"
function LineItemGrid({ rows, setRows, catalog, headerLabel, addLabel, emptyLabel }: Readonly<{
  rows: IncomeRow[]; setRows: (v: IncomeRow[]) => void
  catalog: { group: string; sources: { key: string; label: string }[] }[]
  headerLabel: string; addLabel: string; emptyLabel: string
}>) {
  const [pickerOpen, setPickerOpen] = useState(false)
  function removeRow(i: number) { setRows(rows.filter((_, idx) => idx !== i)) }
  function updateRow(i: number, patch: Partial<IncomeRow>) { setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r)) }
  function addSource(s: { key: string; label: string }) {
    // Keep the picker OPEN — most families add several at once; chips disable as they're added, close via the toggle.
    if (s.key === "other") { setRows([...rows, { key: `other_${rows.length}`, label: "", amount: "", period: "month", custom: true }]); return }
    const idx = rows.findIndex((r) => r.key === s.key)
    if (idx >= 0) { // a hidden speculative row → reveal it rather than duplicate
      if (rows[idx].speculative) setRows(rows.map((r, j) => (j === idx ? { ...r, speculative: false } : r)))
      return
    }
    setRows([...rows, { key: s.key, label: s.label, amount: "", period: "month" }])
  }
  return (
    <div>
      {/* One header row — the label is the first-column header, in line with Amount + Period (which show on sm+). */}
      <div className="flex items-center gap-2 px-0.5 pb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]">
        <span className="min-w-[140px] flex-1">{headerLabel}</span>
        <span className="hidden w-[120px] sm:block">Amount</span>
        <span className="hidden w-[110px] sm:block">Period</span>
        <span className="hidden size-7 shrink-0 sm:block" aria-hidden="true" />
      </div>
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <div key={`${r.key}-${i}`} className={`${r.speculative && moneyCents(r.amount) === 0 ? "hidden lg:flex" : "flex"} flex-wrap items-center gap-2`}>
              {r.custom
                ? <input className={`${CELL} min-w-[140px] flex-1`} value={r.label} placeholder="Name" maxLength={60} onChange={(e) => updateRow(i, { label: e.target.value })} />
                : <span className="min-w-[140px] flex-1 text-sm text-[var(--ink)]">{r.label}</span>}
              <div className="relative w-[120px]">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-[var(--ink-mute)]">R</span>
                <input className={`${CELL_BASE} w-full pl-6 pr-2.5 text-right`} inputMode="numeric" value={r.amount} placeholder="0"
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                  onFocus={() => { const c = moneyCents(r.amount); updateRow(i, { amount: c > 0 ? String(c / 100) : "" }) }}
                  onBlur={() => { const c = moneyCents(r.amount); if (c > 0) updateRow(i, { amount: fmtRands(c) }) }} />
              </div>
              <select className={`${CELL_SELECT} w-[110px]`} value={r.period} onChange={(e) => updateRow(i, { period: e.target.value as IncomePeriod })}>
                {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <button type="button" onClick={() => removeRow(i)} aria-label="Remove" className="flex size-7 shrink-0 items-center justify-center text-[var(--ink-mute)] hover:text-red-600"><X className="size-4" /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-3 text-xs text-[var(--ink-mute)]">{emptyLabel}</p>
      )}
      {/* Grouped "+ Add" picker — most applicants have a handful, so the grid grows only as needed. */}
      <div className="mt-2">
        <button type="button" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen} className="inline-flex w-fit items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
          {pickerOpen ? <><CheckCircle2 className="size-4" /> Done</> : <><Plus className="size-4" /> {addLabel}</>}
        </button>
        {pickerOpen && (
          <div className="mt-2 flex flex-col gap-3 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
            {catalog.map((g) => (
              <div key={g.group}>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{g.group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.sources.map((s) => {
                    // A hidden speculative-empty row doesn't count as "added" — the chip still reveals it.
                    const added = s.key !== "other" && rows.some((r) => r.key === s.key && !(r.speculative && moneyCents(r.amount) === 0))
                    return <button key={s.key} type="button" disabled={added} onClick={() => addSource(s)} className={PICKER_CHIP}>{s.label}</button>
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// A "R left · number right" summary line (matches the grid's Amount column). The amount is always bold; `strong`
// also bolds the label + "monthly" (totals), while a soft label + muted R reads as a derived figure (residual).
function TotalLine({ label, cents, strong = true }: Readonly<{ label: string; cents: number; strong?: boolean }>) {
  const sideCls = strong ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-soft)]"
  return (
    <div className="flex items-center gap-2">
      <span className={`min-w-[140px] flex-1 ${sideCls}`}>{label}</span>
      <span className="flex w-[120px] items-center px-2.5 font-semibold text-[var(--ink)]"><span className={strong ? "" : "font-normal text-[var(--ink-mute)]"}>R</span><span className="flex-1 text-right">{fmtRands(cents)}</span></span>
      <span className={`w-[110px] ${sideCls}`}>monthly</span>
      <span className="size-7 shrink-0" aria-hidden="true" />
    </div>
  )
}

// Finances · Income — itemised sources via the shared grid + the affordability total (child maintenance excluded).
function StepIncome({ income, setIncome, variable }: Readonly<{
  income: IncomeRow[]; setIncome: (v: IncomeRow[]) => void; variable: boolean
}>) {
  const childMaintCents = income.filter((r) => r.key === "maintenance").reduce((s, r) => s + rowMonthlyCents(r), 0)
  const affordabilityTotal = totalMonthlyCents(income) - childMaintCents
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">Every regular source of income. Pick the period for each amount — we convert everything to a monthly figure for the affordability check.</p>
      <div className="flex flex-col gap-4">
        {variable && (
          <p className={HINT_INFO}>Commission or variable income? Enter a typical month — we confirm the average from your bank statements.</p>
        )}
        <LineItemGrid rows={income} setRows={setIncome} catalog={INCOME_CATALOG} headerLabel="Sources of income" addLabel="Add another income source" emptyLabel="No income added yet — add each source you earn from below." />
        {income.length > 0 && (
          <div className="border-t border-[var(--rule)] pt-3 text-sm">
            <TotalLine label="Total monthly income (for affordability)" cents={affordabilityTotal} />
            {childMaintCents > 0 && (
              <p className="mt-1.5 text-[11px] text-[var(--ink-mute)]">Plus {formatZAR(childMaintCents)}/mo child maintenance — treated as covering the child&apos;s costs, not counted as rent-payable income.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Finances · Expenses — TWO clean groupings: (1) Dependents (adult + minor counts → living floor);
// (2) Monthly commitments (the itemised debt/contractual grid that competes with rent — school fees live here as
// a line, but the engine routes them to the child bucket). General living is NOT asked — it's in the living floor.
// The "left after" residual is deliberately NOT shown here — that's surfaced in Application review.
function StepExpenses({ dependentAdults, setDependentAdults, dependentMinors, setDependentMinors, commitments, setCommitments }: Readonly<{
  dependentAdults: string; setDependentAdults: (v: string) => void
  dependentMinors: string; setDependentMinors: (v: string) => void
  commitments: IncomeRow[]; setCommitments: (v: IncomeRow[]) => void
}>) {
  const commitTotal = totalMonthlyCents(commitments)
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">Your committed monthly obligations and the people you support. We ask for real commitments — debit orders, debt, policies — not a full household budget; everyday living costs are already allowed for in the affordability read.</p>

      <section>
        <SectLabel n="01">Dependents</SectLabel>
        <FieldGrid>
          <TextField label="Adult dependants" type="number" value={dependentAdults} onChange={setDependentAdults} placeholder="0" />
          <TextField label="Minor dependants (children)" type="number" value={dependentMinors} onChange={setDependentMinors} placeholder="0" />
        </FieldGrid>
        <p className="mt-3 text-[11px] text-[var(--ink-mute)]">Dependants are people who rely on your income — an adult costs more than a child. Add school fees and child maintenance paid as commitments below; any child maintenance you receive is set against them, not counted as income.</p>
      </section>

      <section>
        <SectLabel n="02">Monthly commitments</SectLabel>
        <LineItemGrid rows={commitments} setRows={setCommitments} catalog={COMMITMENT_CATALOG} headerLabel="Monthly commitments" addLabel="Add a commitment" emptyLabel="No commitments added yet — add each monthly debit order or repayment below." />
        {commitments.length > 0 && (
          <div className="mt-4 border-t border-[var(--rule)] pt-3 text-sm">
            <TotalLine label="Total monthly commitments" cents={commitTotal} />
          </div>
        )}
      </section>
    </div>
  )
}

// Compact bare input for the inline co-applicant rows (placeholders instead of labels → one line per person).
const CO_INPUT = "min-w-[110px] flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none"

// ── Step 4 — Documents (income-driven categories, multi-file) ────────────────────
function docFileIcon(f: DocFile) {
  if (f.uploading) return <Loader2 className="size-4 animate-spin text-[var(--amber-ink)]" />
  if (f.error) return <AlertCircle className="size-4 text-red-600" />
  if (f.uploaded) return <CheckCircle2 className="size-4 text-emerald-600" />
  return <FileText className="size-4 text-[var(--ink-mute)]" />
}

function DocCategoryCard({ cat, files, skipped, onUpload, onRemove, onRename, onEscape }: Readonly<{
  cat: DocCategory; files: DocFile[]; skipped: boolean
  onUpload: (key: string, f: File | null, single: boolean) => void; onRemove: (key: string, id: string) => void
  onRename: (key: string, id: string, name: string) => void; onEscape: (key: string, v: boolean) => void
}>) {
  const showAdd = !(cat.single && files.some((f) => f.uploaded))
  const uploadCta = (
    <label className="inline-flex w-fit shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-1.5 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
      {files.length > 0 ? <Plus className="size-4" /> : <Upload className="size-4" />}
      {files.length > 0 ? "Add another" : "Upload"}
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => { onUpload(cat.key, e.target.files?.[0] ?? null, cat.single); e.currentTarget.value = "" }} />
    </label>
  )
  return (
    <div className="rounded-[var(--r-button)] border border-[var(--rule)] p-3">
      {/* label + hint on the left, Upload CTA on the right — keeps each empty category to one compact row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm font-medium text-[var(--ink)]">{cat.label}{cat.required && <span className="text-[var(--amber-ink)]"> *</span>}</span>
          <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">{cat.hint}</span>
          {cat.escapeLabel && (
            <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-2 text-xs text-[var(--ink-soft)]">
              <input type="checkbox" checked={skipped} onChange={(e) => onEscape(cat.key, e.target.checked)} className="size-3.5 accent-[var(--amber)]" />
              {cat.escapeLabel}
            </label>
          )}
        </div>
        {showAdd && uploadCta}
      </div>
      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1">
              <span className="shrink-0">{docFileIcon(f)}</span>
              {cat.named
                ? <input value={f.name} onChange={(e) => onRename(cat.key, f.id, e.target.value)} placeholder="Name this document" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--ink)] focus:outline-none" />
                : <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">{f.name}</span>}
              {f.detection && <span className="text-xs text-emerald-600">{f.detection}</span>}
              {!f.uploading && <button type="button" onClick={() => onRemove(cat.key, f.id)} aria-label="Remove document" className="text-[var(--ink-mute)] hover:text-red-600"><X className="size-4" /></button>}
              {f.error && <span className="w-full whitespace-pre-line text-xs text-red-600">{f.error}</span>}
            </div>
          ))}
        </div>
      )}
      {cat.escapeNote && skipped && (
        <p className="mt-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-xs text-[var(--ink-soft)]">{cat.escapeNote}</p>
      )}
    </div>
  )
}

function StepDocuments({ tab, categories, docFiles, escape, onUpload, onRemove, onRename, onEscape }: Readonly<{
  tab: "required" | "optional"
  categories: DocCategory[]; docFiles: Record<string, DocFile[]>; escape: Record<string, boolean>
  onUpload: (key: string, f: File | null, single: boolean) => void; onRemove: (key: string, id: string) => void
  onRename: (key: string, id: string, name: string) => void; onEscape: (key: string, v: boolean) => void
}>) {
  const render = (cat: DocCategory) => (
    <DocCategoryCard key={cat.key} cat={cat} files={docFiles[cat.key] ?? []} skipped={!!escape[cat.key]} onUpload={onUpload} onRemove={onRemove} onRename={onRename} onEscape={onEscape} />
  )
  if (tab === "optional") {
    const optional = categories.filter((c) => c.tier === "optional")
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--ink-soft)]">None of these are required — but each one strengthens your application. Add whatever you have; skip the rest.</p>
        <div className="flex flex-col gap-3">{optional.map(render)}</div>
      </div>
    )
  }
  // Required tab — the core (gating) docs + any declaration-driven slots, each shown with why it's needed.
  const required = categories.filter((c) => c.tier === "required")
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--ink-soft)]">We ask only for what matches what you told us — these are the documents your application needs to be verified.</p>
      <div className="flex flex-col gap-3">{required.map(render)}</div>
      <p className="mt-1 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2.5 text-xs text-[var(--ink-soft)]">There&apos;s an <span className="font-medium text-[var(--ink)]">Optional documents</span> tab next — references, proof of address, proof of savings and more that can strengthen your application (never required).</p>
    </div>
  )
}

// ── Step 6 — Submit → instant Step-1 FREE assessment (declared affordability + readiness; zero-AI) ───────────
// The deep-scan ruling UI (ProcessingView/RulingView/poll) was removed here: the applicant no longer triggers an
// AI deep scan at submit. That runs later, on the agent's shortlist (Step 2). (ADDENDUM_14M three-step funnel)

function AmendBar({ onAmend, onRerun }: Readonly<{ onAmend: (s: number) => void; onRerun: () => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton tone="secondary" size="sm" icon={<Upload className="size-4" />} onClick={() => onAmend(STEP_DOCUMENTS)}>Upload documents</ActionButton>
      <ActionButton tone="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => onAmend(0)}>Edit details</ActionButton>
      <ActionButton tone="primary" size="sm" onClick={onRerun}>Re-check now</ActionButton>
    </div>
  )
}

/** Final state — nothing more for the applicant to do; the agent has it. Reached by "Submit to agent". */
function HandoffView() {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Submitted to your agent ✓" sub="Your application is now with your agent." />
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-5">
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          Thanks — your application and documents are now with your agent. They&apos;ll verify everything and update you directly on the outcome. There&apos;s nothing more you need to do for now.
        </p>
      </div>
      <p className="text-xs text-[var(--ink-mute)]">We&apos;ve emailed your confirmation.</p>
    </div>
  )
}

// The doc that corroborates each income source (drives the completeness column's "provided / add it" status).
const AFFORD_BADGE: Record<string, { label: string; cls: string }> = {
  within: { label: "Comfortable", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  marginal: { label: "Tight", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  below: { label: "Short", cls: "border-red-200 bg-red-50 text-red-700" },
  "no-income": { label: "No income", cls: "border-red-200 bg-red-50 text-red-700" },
}
const CITIZEN_LABEL: Record<string, string> = { citizen: "SA citizen", permanent_resident: "Permanent resident", foreign: "Foreign national", unknown: "" }
const MARGIN_ADJ: Record<string, string> = { within: "a comfortable margin", marginal: "a tight margin", below: "a thin margin", "no-income": "" }
function tenureLabel(months: number | null): string | null {
  if (months == null || months <= 0) return null
  const y = Math.floor(months / 12)
  if (y >= 1) return y === 1 ? "1 year" : `${y} years`
  return months === 1 ? "1 month" : `${months} months`
}
// Income-proof doc keys — a missing one is covered by the bank statements (we read income from there).
const INCOME_PROOF = new Set(["payslips", "business_tax", "pension_advice", "grant_proof"])
function docNote(present: boolean, key: string): string {
  if (present) return ""
  return INCOME_PROOF.has(key) ? "— we'll read income from your statements" : "— still to add"
}
/** The written one-line read for the review — composed from the deterministic facts (declared figures + ID decode
 *  + arithmetic). Scoped to the APPLICATION ("complete on what you provided"), never the outcome. */
function reviewSummary(a: FreeAssessmentResult): string {
  const residual = a.randLeftAfterObligationsCents ?? a.randLeftAfterRentCents
  const tenure = tenureLabel(a.employment.tenureMonths)
  const docsAllIn = a.allRequiredDocsPresent
  const verdictGood = a.affordabilityTier === "within" && a.readiness.band === "ready"
  const affClause = a.declaredRatioPct != null && residual != null
    ? `rent is ${a.declaredRatioPct}% of your declared income, leaving ${formatZAR(residual)}/mo after rent and commitments — ${MARGIN_ADJ[a.affordabilityTier] || "as declared"}`
    : "income still to confirm affordability"
  const stabClause = ["identity verified", tenure ? `${tenure} in your current job` : null, docsAllIn ? "documents in" : "documents still to complete"].filter(Boolean).join(", ")
  let closing = "Add the rest to strengthen it."
  if (verdictGood) closing = "A strong, complete application."
  else if (docsAllIn) closing = "A complete application."
  return `On what you've provided: ${affClause}. ${stabClause.charAt(0).toUpperCase()}${stabClause.slice(1)}. ${closing}`
}

/** Step-1 FREE assessment — the application review: Completeness (what's done / still to add) + Residual
 *  affordability (income vs commitments + the residual + a tier read; prompts "Add applicant" when short).
 *  Re-runnable for free; the J1 gate (all co-applicants complete) blocks submit. (ADDENDUM_14M funnel) */
function FreeAssessmentView({ assessment, askingRentCents, emp, onAmend, onRerun, onSubmitToAgent, onAddApplicant }: Readonly<{ assessment: FreeAssessmentResult; askingRentCents: number; emp: Emp; onAmend: (s: number) => void; onRerun: () => void; onSubmitToAgent: () => Promise<boolean>; onAddApplicant: () => void }>) {
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function doSubmit() {
    setSubmitting(true)
    const ok = await onSubmitToAgent()
    if (ok) setDone(true)
    else setSubmitting(false)
  }
  if (done) return <HandoffView />

  const { incompleteCount } = assessment.readiness
  const readyToSubmit = incompleteCount === 0   // J1: someone unfinished → blocked (server enforces too)

  // Waiting on others — this applicant's part is in, but a joint application can't go to the agent until every
  // party has finished. Lead with that status rather than nudging toward a submit they can't make yet.
  if (!readyToSubmit) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeading title="Your part is done ✓" sub="Your details, documents and consent are all in." />
        <div className="rounded-[var(--r-button)] border border-[var(--amber)] bg-[var(--amber-wash)] p-5">
          <p className="flex items-start gap-2.5 text-sm leading-relaxed text-[var(--amber-ink)]">
            <Users className="mt-0.5 size-5 shrink-0" />
            <span>Your application is complete — we&apos;re just waiting on <strong>{incompleteCount}</strong> other {incompleteCount === 1 ? "applicant" : "applicants"} to finish their part. Each has their own link, and nothing goes to the agent until everyone&apos;s done. Come back via your saved link to submit once they&apos;ve finished.</span>
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-3">
          <p className="text-xs text-[var(--ink-mute)]">Want to change something on your side while you wait? It&apos;s free to re-check.</p>
          <AmendBar onAmend={onAmend} onRerun={onRerun} />
        </div>
      </div>
    )
  }

  // Ready — a structured four-dimension read (Affordability · Identity & stability · Declared income · Documents)
  // topped by a written one-line summary. All declared/unverified, zero-AI. The verdict is scoped to the
  // APPLICATION ("complete and affordable on the figures you provided"), never the outcome — the agent decides.
  const incomeCents = assessment.combinedIncomeCents
  const oblCents = assessment.declaredObligationsCents
  const residualCents = assessment.randLeftAfterObligationsCents ?? assessment.randLeftAfterRentCents ?? (incomeCents - askingRentCents - oblCents)
  const ratioPct = assessment.declaredRatioPct
  const multiple = assessment.incomeMultiple
  const badge = AFFORD_BADGE[assessment.affordabilityTier] ?? AFFORD_BADGE["no-income"]
  const short = assessment.affordabilityTier !== "within" // marginal / below / no-income → prompt "Add applicant"
  const pct = (n: number) => (incomeCents > 0 ? Math.max(0, Math.min(100, Math.round((n / incomeCents) * 100))) : 0)
  const identityOk = !assessment.identity.underageCannotSign && assessment.identity.dobMatchesDeclared !== false
  const tenure = tenureLabel(assessment.employment.tenureMonths)
  const empLabel = emp.employment_type ? employmentLabel(emp.employment_type) : null
  const verdictGood = !short && assessment.readiness.band === "ready"
  const idLine = [assessment.identity.residency === "foreign" ? "Passport" : "SA ID verified", assessment.identity.ageYears ? `age ${assessment.identity.ageYears}` : null, CITIZEN_LABEL[assessment.identity.residency]].filter(Boolean).join(" · ")
  const summary = reviewSummary(assessment)
  return (
    <div className="flex min-h-full flex-col gap-5">
      {/* Banner — scoped to the APPLICATION, never the outcome. */}
      <div className={`flex items-start gap-2.5 rounded-[var(--r-button)] border p-4 text-sm leading-relaxed ${verdictGood ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--amber)] bg-[var(--amber-wash)] text-[var(--amber-ink)]"}`}>
        {verdictGood ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <AlertCircle className="mt-0.5 size-5 shrink-0" />}
        <span><strong>{verdictGood ? "Looks good." : "Almost there."}</strong> {verdictGood ? "Your application is complete and affordable on the figures you provided." : "Complete the flagged items below, or submit and add them when the agent requests."}</span>
      </div>

      {/* Written one-line read (interpretive snippet) */}
      <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">{summary}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Affordability — line-item bullets match the bar-chart colours (rent · commitments · left for rent). */}
        <div className="flex flex-col gap-4 rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card p-5">
          <h3 className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]">
            <span className="flex items-center gap-2"><span aria-hidden className="inline-block h-0.5 w-4 bg-amber-400" /> Affordability</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${badge.cls}`}>{badge.label}</span>
          </h3>
          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-[var(--ink-soft)]">Declared income</dt><dd className="font-medium text-[var(--ink)]">{formatZAR(incomeCents)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-[var(--ink-soft)]"><span className="size-2 shrink-0 rounded-full bg-amber-400" /> Commitments</dt><dd className="text-[var(--ink-soft)]">− {formatZAR(oblCents)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-[var(--ink-soft)]"><span className="size-2 shrink-0 rounded-full bg-slate-400" /> This rent</dt><dd className="text-[var(--ink-soft)]">− {formatZAR(askingRentCents)}</dd></div>
          </dl>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--paper-sunk)]" aria-hidden>
            <div className="bg-slate-400" style={{ width: `${pct(askingRentCents)}%` }} />
            <div className="bg-amber-400" style={{ width: `${pct(oblCents)}%` }} />
            <div className="bg-emerald-500" style={{ width: `${pct(Math.max(0, residualCents))}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-3">
            <span className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]"><span className="size-2 shrink-0 rounded-full bg-emerald-500" /> Left for other expenses</span>
            <span className={`text-xl font-semibold ${residualCents >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatZAR(residualCents)}</span>
          </div>
          <p className="text-[11px] text-[var(--ink-mute)]">{ratioPct != null ? `Rent is ${ratioPct}% of income` : "Income still to confirm"}{multiple != null ? ` · income covers rent ${multiple}×` : ""}</p>
          {short && (
            <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
              <p className="text-xs leading-relaxed text-[var(--ink-soft)]">{assessment.affordabilityTier === "no-income" ? "No income declared yet." : "Rent is high relative to your declared income."} Adding a co-applicant or guarantor whose income counts would strengthen affordability.</p>
              <ActionButton tone="secondary" size="sm" icon={<Users className="size-4" />} className="mt-2" onClick={onAddApplicant}>Add applicant</ActionButton>
            </div>
          )}
        </div>

        {/* Identity & documents — the rest of the declared picture (income lives in the Affordability card). */}
        <div className="flex flex-col gap-4 rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card p-5">
          <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]"><span aria-hidden className="inline-block h-0.5 w-4 bg-amber-400" /> Identity &amp; documents</h3>
          <ul className="flex flex-col gap-2.5 text-sm text-[var(--ink)]">
            <li className="flex items-center gap-2">{identityOk ? <ShieldCheck className="size-4 shrink-0 text-emerald-600" /> : <AlertCircle className="size-4 shrink-0 text-amber-500" />} {idLine}</li>
            {empLabel && <li className="flex items-center gap-2"><User className="size-4 shrink-0 text-[var(--ink-mute)]" /> {empLabel}{tenure ? ` · ${tenure}` : ""}</li>}
            {emp.employer && <li className="flex items-center gap-2"><Building2 className="size-4 shrink-0 text-[var(--ink-mute)]" /> {emp.employer}</li>}
          </ul>
          {assessment.employment.recentlyStarted && <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">Recently started — possibly still in probation. The agent sees this as context.</p>}
          {assessment.employment.contractEndsBeforeLease && <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-[11px] text-[var(--ink-soft)]">Stated contract ends before the lease term — worth a note on whether it&apos;s expected to renew.</p>}

          <div className="border-t border-[var(--rule)] pt-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Documents</p>
            <ul className="flex flex-col gap-2 text-sm text-[var(--ink)]">
              {assessment.documents.map((d) => {
                const note = docNote(d.present, d.key)
                return (
                  <li key={d.key} className="flex items-start gap-2">
                    {d.present ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />}
                    <span>{d.label}{note && <span className="text-[var(--ink-mute)]"> {note}</span>}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* What happens next — sets the journey, reinforces pre-selection + the consent/credit-check expectation. */}
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4">
        <h3 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]"><span aria-hidden className="inline-block h-0.5 w-4 bg-amber-400" /> What happens next</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">You submit → if the agent shortlists you, your documents are verified against what you declared → an optional credit check runs only with your explicit consent, and you&apos;ll receive a copy.</p>
      </div>

      {/* Submit pinned to the BOTTOM of the card (mt-auto), bottom-right. No "amend" button — Back + the side nav
          handle edits. Consent + email verification happened at the review landing, so this just sends. */}
      <div className="mt-auto flex justify-end pt-3">
        <ActionButton tone="primary" icon={<CheckCircle2 className="size-4" />} disabled={submitting} onClick={doSubmit}>{submitting ? "Submitting…" : "Submit application"}</ActionButton>
      </div>
    </div>
  )
}

/** Anti-bot email verification — send a 6-digit code to the applicant's email, then confirm it before submit. */
function VerifyEmail({ applicationId, token, email, verified, onVerified }: Readonly<{
  applicationId: string | null; token: string | null; email?: string; verified: boolean; onVerified: () => void
}>) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!applicationId || !token) { toast.error("Please complete the earlier steps first."); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/verify/send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
      const json = await res.json() as { ok?: boolean; alreadyVerified?: boolean; error?: string }
      if (json.alreadyVerified) { onVerified(); return }
      if (!res.ok) { toast.error(json.error ?? "Could not send the code."); return }
      setSent(true); toast.success(`Code sent to ${email}`)
    } catch { toast.error("Could not send the code.") } finally { setBusy(false) }
  }
  async function check() {
    if (!applicationId || !token) return
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/verify/check`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, code }),
      })
      const json = await res.json() as { ok?: boolean; status?: string; error?: string }
      if (json.ok && json.status === "verified") { onVerified(); toast.success("Email verified ✓") }
      else if (json.status === "locked") toast.error(json.error ?? "Too many attempts — try again later.")
      else if (json.status === "expired") { toast.error("That code expired — send a new one."); setSent(false); setCode("") }
      else toast.error("Incorrect code — check and try again.")
    } catch { toast.error("Could not verify the code.") } finally { setBusy(false) }
  }

  if (verified) {
    return (
      <p className="flex items-center gap-2 rounded-[var(--r-button)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4" /> Email verified
      </p>
    )
  }
  return (
    <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4">
      <p className="text-sm font-medium text-[var(--ink)]">Verify your email</p>
      <p className="mt-0.5 text-xs text-[var(--ink-soft)]">We&apos;ll send a 6-digit code to <strong className="text-[var(--ink)]">{email ?? "your email"}</strong> to confirm it&apos;s really you before submitting.</p>
      {!sent ? (
        <ActionButton tone="secondary" size="sm" onClick={send} disabled={busy} className="mt-2">Send code</ActionButton>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="123456" className="w-28 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1.5 text-sm tracking-[0.3em]" />
          <ActionButton tone="primary" size="sm" onClick={check} disabled={busy || code.length !== 6}>Verify</ActionButton>
          <button type="button" onClick={send} disabled={busy} className="text-xs text-[var(--ink-mute)] hover:text-[var(--ink)]">Resend</button>
        </div>
      )}
    </div>
  )
}

function StepSubmit({ form, emp, income, askingRentCents, consent, setConsent, coApplicants, applicantsGreen, screeningStatus, assessment, onAmend, onRerun, onContinue, onAddApplicant, applicationId, token, emailVerified, onVerified }: Readonly<{
  form: PartyFormState; emp: Emp; income: IncomeRow[]; askingRentCents: number; consent: boolean; setConsent: (v: boolean) => void
  coApplicants: CoApplicant[]; applicantsGreen: boolean; screeningStatus: ScreeningStatus; assessment: FreeAssessmentResult | null
  onAmend: (s: number) => void; onRerun: () => void; onContinue: () => void; onAddApplicant: () => void
  applicationId: string | null; token: string | null; emailVerified: boolean; onVerified: () => void
}>) {
  // The REAL submission — only when the applicant reviews the pre-screen and chooses to send it to the agent.
  async function submitToAgent(): Promise<boolean> {
    if (!applicationId || !token) return true
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit-to-agent`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast.error(b.error ?? "Could not submit. Please try again."); return false }
      return true
    } catch { toast.error("Could not submit. Please try again."); return false }
  }

  if (screeningStatus === "done" && assessment) return <FreeAssessmentView assessment={assessment} askingRentCents={askingRentCents} emp={emp} onAmend={onAmend} onRerun={onRerun} onSubmitToAgent={submitToAgent} onAddApplicant={onAddApplicant} />

  const name = [form.firstName, form.lastName].filter(Boolean).join(" ") || "—"
  const incomeCents = totalMonthlyCents(income)
  const namedSources = income.filter((r) => moneyCents(r.amount) > 0)
  const ratio = incomeCents > 0 ? Math.round((askingRentCents / incomeCents) * 100) : null
  const probation = startedWithinProbation(emp.start_date)
  const others = coApplicants.filter((c) => c.email.trim())
  return (
    <div className="flex min-h-full flex-col gap-4">
      <StepHeading title="Application review" sub="Confirm your email and give consent to continue — then you'll see your review and can submit. Everyone on the application consents and verifies on their own link." />
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-sm">
        <Row k="Applicant" v={name} />
        <Row k="Email" v={form.email ?? "—"} />
        <Row k="Employment" v={emp.employment_type ? employmentLabel(emp.employment_type) : "—"} />
        {emp.start_date && <Row k="Employed since" v={probation ? `${emp.start_date} · possible probation` : emp.start_date} />}
        <Row k="Total income" v={incomeCents > 0 ? formatZAR(incomeCents) + " /mo" : "—"} />
        {namedSources.map((r) => <Row key={r.key} k={`— ${r.label || "Other"}`} v={`${formatZAR(rowMonthlyCents(r))} /mo`} />)}
        <Row k="Rent-to-income" v={ratio != null ? `${ratio}%` : "—"} />
        {others.length > 0 && <Row k="Others" v={others.map((c) => c.role === "guarantor" ? "guarantor" : "co-applicant").join(", ")} />}
      </div>
      <VerifyEmail applicationId={applicationId} token={token} email={form.email} verified={emailVerified} onVerified={onVerified} />
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--amber)]" />
        <span className="text-[13px] leading-relaxed text-[var(--ink-soft)]">
          <ShieldCheck className="mr-1 inline size-3.5 text-[var(--ink-mute)]" />
          I consent to Pleks processing the information and documents I&apos;ve provided — including automated (AI) analysis of my uploaded documents — to pre-screen this application (POPIA). No credit check or bureau enquiry runs at this stage; that only happens later if I&apos;m shortlisted and I consent again.
        </span>
      </label>
      {/* Continue pinned to the BOTTOM of the card (mt-auto), bottom-right — the header keeps only Back. */}
      <div className="mt-auto flex justify-end pt-3">
        <ActionButton tone="primary" onClick={onContinue} disabled={!consent || !applicantsGreen || !emailVerified}>Continue to review</ActionButton>
      </div>
    </div>
  )
}

function Row({ k, v }: Readonly<{ k: string; v: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] py-2 last:border-0">
      <span className="shrink-0 text-[var(--ink-mute)]">{k}</span>
      <span className="text-right font-medium text-[var(--ink)]">{v}</span>
    </div>
  )
}
