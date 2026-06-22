"use client"

/**
 * app/(applicant)/apply/[slug]/preview/StepPanel.tsx — the interactive apply wizard (client island)
 *
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  A 4-card LANDING (application type) → a functional 6-step wizard wired to the REAL backend.
 *         Every type except "Just me" implies >1 party, so the co-applicant/company invite is captured UP
 *         FRONT (an InviteCapture panel right after the landing) and dispatched once the application exists.
 *           Landing — Just me · Couple/multiple · Company · On behalf/guarantor (each a short blurb).
 *           1 Personal details — the applicant (or, for a company, the contact/director) reuses the
 *             add-tenant capture (IndividualIdentity; SA-ID auto-fills DOB+gender).
 *           2 Address — mandatory current address.
 *           3 Income — employment status + date employed + employer, then an "excel" sources-of-income grid
 *             (Employment gross + rental/dividends/maintenance/… + custom), each with a period
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

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Plus, X, Upload, FileText, CheckCircle2, Loader2, AlertCircle, ShieldCheck, User, Users, Building2, HandCoins, ArrowLeft, Pencil, Clock } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import type { LucideIcon } from "lucide-react"
import { IndividualIdentity, CompanyAddressSection } from "@/components/parties/partySteps"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import { validateUpload } from "@/lib/extraction/uploadValidator"
import {
  validateIdentityCore, validateAddressStep,
  type PartyFormState, type PartyErrors, type PartyAddressInput, type PartyPerson, type PartyBankAccountInput,
} from "@/lib/parties/partyValidation"
import { formatZAR, startedWithinProbation, PROBATION_MONTHS, MAX_SCREENING_ITERATIONS } from "@/lib/constants"

type ApplicantType = "individual" | "couple" | "company" | "guarantor"
/** Card copy adapts to the lease type — "I'll live here" makes no sense on a commercial lease. */
function typesFor(commercial: boolean): ReadonlyArray<{ id: ApplicantType; icon: LucideIcon; title: string; blurb: string }> {
  return [
    { id: "individual", icon: User, title: commercial ? "Sole proprietor" : "Just me", blurb: commercial ? "I'm leasing in my own name (sole proprietor)." : "I'll be the only person on the lease." },
    { id: "couple", icon: Users, title: commercial ? "Partners / multiple" : "Couple / multiple", blurb: commercial ? "Two or more partners on the lease together — each gets their own secure link." : "Two or more of us will be on the lease together — each gets their own secure link." },
    { id: "company", icon: Building2, title: "Company", blurb: "A registered business is leasing, with a director signing surety." },
    { id: "guarantor", icon: HandCoins, title: "On behalf / guarantor", blurb: commercial ? "A surety backs the application but won't be on the lease." : "Someone backs the application financially but won't live here — e.g. a parent for an adult child." },
  ]
}

const STEPS = ["Personal details", "Address", "Income", "Documents", "Applicants", "Submit"]

const EMPLOYMENT_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "permanent", label: "Permanently employed" },
  { value: "contract", label: "Contract" },
  { value: "commission", label: "Commission-based" },
  { value: "self_employed", label: "Self-employed" },
  { value: "part_time", label: "Part-time" },
  { value: "retired", label: "Retired" },
  { value: "unemployed", label: "Unemployed" },
  { value: "other", label: "Other" },
]

type SetFn = (k: keyof PartyFormState, v: string | string[] | boolean | PartyPerson[] | PartyAddressInput[] | PartyBankAccountInput[]) => void
type Emp = { employment_type: string; employer: string; start_date: string }
type CoRole = "co_applicant" | "guarantor"

type IncomePeriod = "month" | "quarter" | "annual"
type IncomeRow = { key: string; label: string; amount: string; period: IncomePeriod; custom?: boolean }
const PERIOD_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "annual", label: "Annual" },
]
const PERIOD_DIVISOR: Record<IncomePeriod, number> = { month: 1, quarter: 3, annual: 12 }
/** The fixed "excel" rows of the sources-of-income grid. "Employment (gross)" is the salary; the agent fills
 *  what applies and adds custom rows. Each carries its own period (month/quarter/annual). */
const SEED_INCOME: IncomeRow[] = [
  { key: "employment", label: "Employment (gross)", amount: "", period: "month" },
  { key: "other_remuneration", label: "Other remuneration", amount: "", period: "month" },
  { key: "alimony", label: "Alimony", amount: "", period: "month" },
  { key: "maintenance", label: "Maintenance", amount: "", period: "month" },
  { key: "rental", label: "Rental income", amount: "", period: "month" },
  { key: "dividends", label: "Shares / dividends", amount: "", period: "month" },
  { key: "savings_interest", label: "Savings / interest", amount: "", period: "month" },
]
const moneyCents = (s: string) => Math.round(parseFloat(s.replaceAll(/[^\d.]/g, "") || "0") * 100)
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
interface DocCategory { key: string; label: string; hint: string; single: boolean; required: boolean; escapeLabel?: string; escapeNote?: string; named?: boolean; booster?: boolean }

/** The documents we ask for are DERIVED from the declared income (the Income step) — so we request exactly the
 *  evidence that best supports this applicant's sources (14M §4) and guide them to the strongest outcome. */
function hasIncome(income: IncomeRow[], key: string): boolean { return income.some((r) => r.key === key && moneyCents(r.amount) > 0) }
function deriveDocCategories(income: IncomeRow[], employmentType: string): DocCategory[] {
  const variable = employmentType === "commission" || employmentType === "self_employed"
  const cats: DocCategory[] = [
    { key: "id", label: "ID document", hint: "Your SA ID (smart card or green book) or passport.", single: true, required: true },
  ]
  if (hasIncome(income, "employment")) {
    cats.push({ key: "payslips", label: "Payslips", hint: variable ? "Your 3 most recent commission / payslip statements — one file or several." : "Your 3 most recent payslips — a combined PDF or separate files.", single: false, required: false, escapeLabel: "I don't have 3 payslips — I'll upload what I have", escapeNote: "Fewer payslips means we can verify less of your income — your agent will see this." })
  }
  cats.push({ key: "bank_main", label: "Bank statement — main account", hint: variable ? "6 months for the account your income is paid into — we average variable income over 6 months for the fairest result." : "3 consecutive months for the account your income is paid into.", single: false, required: true, escapeLabel: "I don't have all the requested statements — I'll upload what I have", escapeNote: "Fewer months means we can verify less of your income — your agent will see this." })
  if (hasIncome(income, "savings_interest") || hasIncome(income, "dividends")) {
    cats.push({ key: "bank_savings", label: "Savings / investment statement", hint: "A statement for the savings or investment account behind that income.", single: false, required: false, escapeLabel: "I can't supply this", escapeNote: "Extra declared income can't be verified if you don't supply additional information — it won't count towards your affordability." })
  }
  // Optional boosters — shown with a "when it helps" explanation; they raise confidence, never required.
  if (hasIncome(income, "employment")) {
    cats.push({ key: "employment_letter", label: "Employment letter or contract", hint: "Substantiates your job and salary — especially helpful if you started recently (it can clear a probation flag).", single: true, required: false, booster: true })
  }
  cats.push({ key: "current_lease", label: "Current lease / rental agreement", hint: "If you already rent, add your lease — it proves what you currently afford and can lift your affordability result.", single: true, required: false, booster: true })
  cats.push({ key: "other", label: "Other documents", hint: "Anything else that strengthens your application — name each one (e.g. previous rental reference, court order, foreign bank statement).", single: false, required: false, named: true })
  return cats
}

interface CoApplicant { firstName: string; lastName: string; email: string; phone: string; idNumber: string; role: CoRole; invited: boolean }
interface CompanyInfo { companyType: string; companyReg: string }
type ScreeningStatus = "idle" | "processing" | "done" | "failed"
interface RulingFlagView { id: number; key: string; axis: string; severity: string; type: string; title: string; remediation: string | null }
interface ScreeningEvaluation {
  iteration_number: number; ruling_tier: string; affordability_tier: string
  affordability_ratio_pct: number | null; demonstrated_housing_cents: number | null
  confidence_tier: string; flags: RulingFlagView[]
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
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
  applicantType: ApplicantType | null; company: CompanyInfo | null
  form: Partial<PartyFormState>; emp: Emp
  incomeSources: { key: string; label: string; amount_cents: number; period: string }[]
  coApplicants: CoApplicant[]; docPaths: { name: string; storagePath: string }[]
}
/** Rebuild the editable income grid from the persisted income_sources: fill the fixed rows by key, append any
 *  unknown keys as custom rows. amount is rands-as-string (the grid's input shape). */
function rebuildIncome(stored: ResumeState["incomeSources"]): IncomeRow[] {
  const rows: IncomeRow[] = SEED_INCOME.map((r) => ({ ...r }))
  const byKey = new Map(stored.map((s) => [s.key, s]))
  for (const r of rows) {
    const s = byKey.get(r.key)
    if (s) { r.amount = String(s.amount_cents / 100); r.period = (s.period as IncomePeriod) || "month"; byKey.delete(r.key) }
  }
  for (const s of byKey.values()) {
    rows.push({ key: s.key || `custom_${rows.length}`, label: s.label || "Other source", amount: String(s.amount_cents / 100), period: (s.period as IncomePeriod) || "month", custom: true })
  }
  return rows
}
/** A resumed draft doesn't persist the chosen party type — infer it from the co-applicants. Company drafts
 *  (not persisted) resume as individual (the rare path); the applicant re-selects the type if needed. */
function inferType(cos: CoApplicant[]): ApplicantType {
  if (cos.some((c) => c.role === "guarantor")) return "guarantor"
  if (cos.some((c) => c.role === "co_applicant")) return "couple"
  return "individual"
}
/** Map a stored filename back to its doc category — paths are `{categoryKey}.ext` or `{categoryKey}_{id}.ext`. */
function categoryForFilename(name: string, cats: DocCategory[]): string {
  const base = name.replace(/\.[^.]+$/, "")
  for (const k of [...cats.map((c) => c.key)].sort((a, b) => b.length - a.length)) {
    if (base === k || base.startsWith(`${k}_`)) return k
  }
  return "other"
}
/** Rebuild docFiles from the paths already in Storage — placeholders (uploaded:true) carry the real storagePath
 *  so they remain removable; the original filename/content is NOT re-rendered (POPIA — show "uploaded", a count). */
function seedDocFiles(income: IncomeRow[], employmentType: string, docPaths: { name: string; storagePath: string }[]): Record<string, DocFile[]> {
  const cats = deriveDocCategories(income, employmentType)
  const out: Record<string, DocFile[]> = {}
  for (const p of docPaths) {
    const cat = categoryForFilename(p.name, cats)
    out[cat] = [...(out[cat] ?? []), { id: `resumed_${p.name}`, name: "Uploaded document", uploading: false, uploaded: true, storagePath: p.storagePath }]
  }
  return out
}

function tabClass(done: boolean, cur: boolean): string {
  if (cur) return "stoep font-medium text-[var(--ink)]"
  if (done) return "text-[var(--ink)]"
  return "text-[var(--ink-mute)]"
}
function circleClass(done: boolean, cur: boolean): string {
  if (done) return "bg-[var(--ink)] text-[var(--paper)]"
  if (cur) return "border-[1.5px] border-[var(--amber)] text-[var(--amber-ink)]"
  return "border-[1.5px] border-[var(--rule-strong)] text-[var(--ink-mute)]"
}

function TabBar({ step, maxReached, onJump }: Readonly<{ step: number; maxReached: number; onJump: (i: number) => void }>) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-[var(--rule)]">
      {STEPS.map((label, i) => {
        const done = i < step
        const cur = i === step
        const reachable = i <= maxReached
        return (
          <button key={label} type="button" disabled={!reachable} onClick={() => reachable && onJump(i)}
            className={`flex items-center gap-2 pb-2.5 text-[13px] ${tabClass(done, cur)} ${reachable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
            <span className={`flex size-[18px] items-center justify-center rounded-full text-[10px] ${circleClass(done, cur)}`}>{done ? "✓" : i + 1}</span>
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Cta({ label, onClick, busy, disabled }: Readonly<{ label: string; onClick: () => void; busy?: boolean; disabled?: boolean }>) {
  return (
    <ActionButton tone="primary" onClick={onClick} disabled={busy || disabled} className="min-w-[200px] justify-center">
      {busy ? "Working…" : label}
    </ActionButton>
  )
}

export function StepPanel({ slug, orgId, leaseType, askingRentCents, prefill, resume }: Readonly<{
  slug: string; orgId: string; leaseType: "residential" | "commercial"; askingRentCents: number
  prefill?: Partial<PartyFormState> | null
  resume?: ResumeState | null
}>) {
  const commercial = leaseType === "commercial"
  // Resuming a saved draft (the ?app&token link) rehydrates identity/income/employment/docs/co-applicants and
  // drops the applicant back on the step they left. Address isn't persisted by the apply flow, so it re-enters.
  const resumedIncome = resume ? rebuildIncome(resume.incomeSources) : null
  const [type, setType] = useState<ApplicantType | null>(resume ? (resume.applicantType ?? inferType(resume.coApplicants)) : null)
  const [step, setStep] = useState(resume?.step ?? 0)
  const [maxReached, setMaxReached] = useState(resume?.step ?? 0)

  // Seed identity from the resumed draft (else the logged-in user's own record; financial/employment stay empty
  // for a fresh start but rehydrate on resume).
  const [form, setForm] = useState<PartyFormState>({ idType: "sa_id", ...(prefill ?? {}), ...(resume?.form ?? {}) })
  const [errors, setErrors] = useState<PartyErrors>({})
  const [emp, setEmp] = useState<Emp>(resume?.emp ?? { employment_type: "", employer: "", start_date: "" })
  const [income, setIncome] = useState<IncomeRow[]>(resumedIncome ?? SEED_INCOME)
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

  const [coApplicants, setCoApplicants] = useState<CoApplicant[]>(resume?.coApplicants ?? [])
  const [company, setCompany] = useState<CompanyInfo>(resume?.company ?? { companyType: "", companyReg: "" })
  const [invitePending, setInvitePending] = useState(false)
  const [docFiles, setDocFiles] = useState<Record<string, DocFile[]>>(resume && resumedIncome ? seedDocFiles(resumedIncome, resume.emp.employment_type, resume.docPaths) : {})
  const [docEscape, setDocEscape] = useState<Record<string, boolean>>({})
  const [consent, setConsent] = useState(false)
  const [screeningStatus, setScreeningStatus] = useState<ScreeningStatus>("idle")
  const [evaluation, setEvaluation] = useState<ScreeningEvaluation | null>(null)

  function advance(to: number) { setStep(to); setMaxReached((m) => Math.max(m, to)) }

  function pickType(t: ApplicantType) {
    setType(t)
    setStep(0); setMaxReached(0)
    setCompany({ companyType: "", companyReg: "" })
    // Every type except "individual" implies more than one party — capture that invite UP FRONT (at type
    // selection), held now and dispatched once the application exists (at create). guarantor = a non-occupant
    // backer; couple = a co-applicant who lives here; company = the business (type + reg).
    if (t === "guarantor") { setCoApplicants([blankCo("guarantor")]); setInvitePending(true) }
    else if (t === "couple") { setCoApplicants([blankCo("co_applicant")]); setInvitePending(true) }
    else if (t === "company") { setCoApplicants([]); setInvitePending(true) }
    else { setCoApplicants([]); setInvitePending(false) }
  }

  function confirmInvite() {
    if (type === "company") {
      if (!company.companyType) { toast.error("Please select the company type."); return }
    } else {
      const c = coApplicants[0]
      if (!c || !coComplete(c)) { toast.error("Add the co-applicant's name, email and ID number."); return }
    }
    setInvitePending(false)
  }

  function backToTypes() {
    if (applicationId) return // can't change type after the application is created
    setType(null); setStep(0); setMaxReached(0); setErrors({}); setInvitePending(false)
  }

  function goBack() {
    if (step === 0) backToTypes()
    else setStep(step - 1)
  }

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

  // UPSERT the draft (create on first save, update thereafter — keyed on the held applicationId/token). Every
  // call EXTENDS the 30-day token server-side so a long document-gathering session isn't killed mid-edit. Shared
  // by createApplication (Income→Documents) and "Save & finish later". Email is required (to send the link).
  async function saveDraft(stepToSave: number, opts?: { explicit?: boolean; silent?: boolean }): Promise<{ id: string; url: string | null; emailed: boolean } | null> {
    if (!form.email) { if (!opts?.silent) { toast.error("Add your email first so we can send you a link to finish later.") } return null }
    try {
      const res = await fetch("/api/applications/save-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug, applicationId, token, step: stepToSave, notify: !!opts?.explicit,
          first_name: form.firstName, last_name: form.lastName, email: form.email, phone: form.phone,
          id_type: form.idType || "sa_id", id_number: form.idNumber, date_of_birth: form.dob || "",
          employment_type: emp.employment_type, employer_name: emp.employer, employment_start_date: emp.start_date || "",
          // income_sources is the source of truth; gross_monthly_income (rands) is the derived total — the route
          // re-derives both from income_sources and stores gross_monthly_income_cents (cents).
          gross_monthly_income: String(totalMonthlyCents(income) / 100),
          income_sources: incomeSourcesPayload(income),
          addresses: form.addresses ?? null,
          applicant_type: type,
          company_info: type === "company" ? company : null,
        }),
      })
      const json = await res.json() as { applicationId?: string; token?: string; resumeUrl?: string; emailed?: boolean; error?: string }
      if (!res.ok || !json.applicationId || !json.token) { if (!opts?.silent) { toast.error(json.error ?? "Could not save your progress.") } return null }
      setApplicationId(json.applicationId); setToken(json.token)
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
      const r = await saveDraft(3)            // silent create-or-update (no email), then move on
      if (!r) return
      void dispatchInvites(r.id)              // fire the held at-selection invites now the application exists
      advance(3)
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

  async function continueApplicants() {
    if (!applicationId) { advance(5); return }
    setBusy(true)
    try {
      await dispatchInvites(applicationId) // send any invites added at the roster
      advance(5)
      autosave(5)
    } finally {
      setBusy(false)
    }
  }

  async function uploadDoc(categoryKey: string, file: File | null, single: boolean) {
    if (!file || !applicationId) return
    const fileId = `${categoryKey}_${crypto.randomUUID().slice(0, 8)}`
    const entry: DocFile = { id: fileId, name: file.name, uploading: true, uploaded: false, storagePath: null }
    setDocFiles((prev) => ({ ...prev, [categoryKey]: single ? [entry] : [...(prev[categoryKey] ?? []), entry] }))
    const patch = (p: Partial<DocFile>) => setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).map((f) => f.id === fileId ? { ...f, ...p } : f) }))

    // Four-gate validation client-side (extension + MIME + magic bytes + password-protected PDF) — the same
    // ADDENDUM_14L gate the agent route uses; the applicant uploads straight to Storage, so enforce it here.
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
        if (res.ok) detection = ((await res.json()) as { summary?: string }).summary ?? null
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
      advance(4)
    } finally {
      setBusy(false)
    }
  }

  /** Amend the application (add applicant / upload docs / edit details) → re-enter that step; the user
   *  re-submits to run a fresh screening iteration (the 14M self-improvement loop). */
  function amendAt(toStep: number) { setScreeningStatus("idle"); setEvaluation(null); setStep(toStep) }

  async function submitApplication() {
    if (!applicationId || !token) return
    setBusy(true); setScreeningStatus("processing"); setEvaluation(null)
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) { toast.error(json.error ?? "Could not submit your application."); setScreeningStatus("idle"); return }
      void pollScreening(applicationId, token)   // background poll; the panel shows "processing"
    } catch {
      toast.error("Could not submit your application."); setScreeningStatus("idle")
    } finally {
      setBusy(false)
    }
  }

  /** Poll the screen route until the ruling lands. Backs off 2s→6s and tolerates offline/reconnect (it keeps
   *  polling on a fetch error) rather than hammering; gives up (failed) after ~3 min. */
  async function pollScreening(appId: string, tok: string) {
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(Math.min(2000 + attempt * 500, 6000))   // first wait = the guaranteed "breathing" beat
      try {
        const res = await fetch(`/api/applications/${appId}/screen?token=${encodeURIComponent(tok)}`)
        const json = await res.json() as { status?: string; evaluation?: ScreeningEvaluation }
        if (json.status === "done" && json.evaluation) { setEvaluation(json.evaluation); setScreeningStatus("done"); return }
        if (json.status === "failed") { setScreeningStatus("failed"); return }
      } catch { /* offline / reconnect — keep polling */ }
    }
    setScreeningStatus("failed")
  }

  const docCategories = deriveDocCategories(income, emp.employment_type)
  const docsReady = docCategories.filter((c) => c.required).every((c) => (docFiles[c.key] ?? []).some((f) => f.uploaded))
    && !Object.values(docFiles).flat().some((f) => f.uploading)
  const companyOk = type !== "company" || Boolean(company.companyType)
  // Submit gate: every applicant "green" — primary is implicit, each co-applicant has name+email+id (or is
  // already invited), and a company application has its type captured.
  const applicantsGreen = companyOk && coApplicants.every((c) => c.invited || coComplete(c))
  // The footer ALWAYS shows the pre-selection disclaimer — the save confirmation lives in the modal, not here.
  const disclaimer = "Pre-selection only — affordability and shortlisting. No credit check or bureau enquiry runs at this stage; that happens later, only after you submit and give explicit consent."
  const scrollCls = "flex-1 py-3 [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:overflow-y-auto"
  const footerCls = "flex shrink-0 flex-wrap items-center justify-between gap-3 pb-5 pt-4"
  const backBtn = "min-w-[200px] justify-center"

  return (
    <main className="flex min-w-0 flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
      <div className="fs-panel mb-1.5 flex flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0" style={{ maxWidth: "none", width: "100%" }}>
        <span className="fs-knob" aria-hidden="true" />

        {type === null && (
          <div className={scrollCls}><Landing onPick={pickType} commercial={commercial} /></div>
        )}

        {type !== null && invitePending && (
          <>
            <div className={scrollCls}>
              <InviteCapture type={type} commercial={commercial} coApplicants={coApplicants} setCoApplicants={setCoApplicants} company={company} setCompany={setCompany} />
            </div>
            <div className={footerCls}>
              <ActionButton tone="secondary" icon={<ArrowLeft className="size-4" />} onClick={backToTypes} className={backBtn}>Back to application type</ActionButton>
              <Cta label="Continue" onClick={confirmInvite} busy={busy} />
            </div>
          </>
        )}

        {type !== null && !invitePending && (
          <>
            <TabBar step={step} maxReached={maxReached} onJump={setStep} />
            <div className={scrollCls}>
              {step === 0 && <StepPersonal type={type} commercial={commercial} form={form} set={set} errors={errors} />}
              {step === 1 && <StepAddress form={form} set={set} errors={errors} />}
              {step === 2 && <StepIncome emp={emp} setEmp={setEmp} income={income} setIncome={setIncome} />}
              {step === 3 && <StepDocuments categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />}
              {step === 4 && <StepApplicants type={type} commercial={commercial} coApplicants={coApplicants} setCoApplicants={setCoApplicants} company={company} primaryName={[form.firstName, form.lastName].filter(Boolean).join(" ") || "You"} />}
              {step === 5 && <StepSubmit form={form} emp={emp} income={income} askingRentCents={askingRentCents} consent={consent} setConsent={setConsent} coApplicants={coApplicants} screeningStatus={screeningStatus} evaluation={evaluation} onAmend={amendAt} onRerun={submitApplication} />}
            </div>
            <div className={footerCls}>
              <div className="flex items-center gap-3">
                {!(step === 5 && screeningStatus !== "idle") && (
                  <ActionButton tone="secondary" icon={<ArrowLeft className="size-4" />} onClick={goBack} disabled={step === 0 && !!applicationId} className={backBtn}>
                    {step === 0 ? "Back to application type" : "Back"}
                  </ActionButton>
                )}
              </div>
              {step === 0 && <Cta label="Continue" onClick={continueIdentity} busy={busy} />}
              {step === 1 && <Cta label="Continue" onClick={continueAddress} busy={busy} />}
              {step === 2 && <Cta label="Continue to documents" onClick={createApplication} busy={busy} />}
              {step === 3 && <Cta label="Continue to applicants" onClick={finishDocuments} busy={busy} disabled={!docsReady} />}
              {step === 4 && <Cta label="Continue to review" onClick={continueApplicants} busy={busy} disabled={!applicantsGreen} />}
              {step === 5 && screeningStatus === "idle" && <Cta label="Submit application" onClick={submitApplication} busy={busy} disabled={!consent || !applicantsGreen} />}
            </div>
          </>
        )}

        <div className="flex shrink-0 items-start justify-between gap-3 border-t border-[var(--rule)] pt-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--ink-soft)]">
              <span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: "var(--positive, #2f9e63)" }} />
              {disclaimer}
            </span>
          </div>
          {/* Save & finish later — a visible secondary button (same hover style as "Back to application type"),
              sitting under Continue. Once saved it flips to a green tick + "Saved" (still re-savable). */}
          {type !== null && form.email && step <= 4 && screeningStatus === "idle" && (
            <ActionButton
              tone="secondary"
              icon={saved ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Clock className="size-4" />}
              onClick={saveAndExit}
              disabled={busy}
              className={backBtn}
            >
              {saved ? "Saved" : "Save & finish later"}
            </ActionButton>
          )}
        </div>
      </div>

      {/* Resume-link confirmation modal — shown after an explicit Save & finish later. */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setSaveModalOpen(false)}>
          <div className="w-full max-w-md rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
              <CheckCircle2 className="size-5 text-emerald-600" /> Saved — you can finish later
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
              {emailed
                ? <>We&apos;ve emailed a resume link to <strong className="text-[var(--ink)]">{form.email}</strong>. Or copy the link below to come back to your application directly.</>
                : <>Your progress is saved. Copy the link below to come back to your application — keep it somewhere safe.</>}
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
    </main>
  )
}

// ── Landing — application type cards ──────────────────────────────────────────────
function Landing({ onPick, commercial }: Readonly<{ onPick: (t: ApplicantType) => void; commercial: boolean }>) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-medium tracking-[-0.01em] text-[var(--ink)]">How are you applying?</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">Pick the option that fits — it&apos;s free to start and no credit check runs at this stage.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {typesFor(commercial).map((t) => (
          <button key={t.id} type="button" onClick={() => onPick(t.id)}
            className="group flex flex-col items-start gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-left transition-colors hover:border-[var(--amber)]">
            <span className="flex size-9 items-center justify-center rounded-[var(--r-button)] bg-[var(--amber-wash)] text-[var(--amber-ink)]"><t.icon className="size-5" /></span>
            <span className="text-sm font-semibold text-[var(--ink)]">{t.title}</span>
            <span className="text-[13px] leading-snug text-[var(--ink-soft)]">{t.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function StepHeading({ title, sub }: Readonly<{ title: string; sub: string }>) {
  return (
    <div>
      <h2 className="text-xl font-medium tracking-[-0.01em] text-[var(--ink)]">{title}</h2>
      <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">{sub}</p>
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
    <div className="flex flex-col gap-2">
      <p className="max-w-prose text-sm text-[var(--ink-soft)]">{sub}</p>
      <IndividualIdentity f={form} set={set} errors={errors} fullFica stepNumber="" />
    </div>
  )
}

// ── Step 2 — Address ─────────────────────────────────────────────────────────────
function StepAddress({ form, set, errors }: Readonly<{ form: PartyFormState; set: SetFn; errors: PartyErrors }>) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Your current address" sub="Where you live now — it helps verify your application." />
      <CompanyAddressSection n="" title="Current address" optional={false} addresses={form.addresses ?? []} onChange={(a) => set("addresses", a)} error={errors.addresses} />
    </div>
  )
}

// ── Step 3 — Income (employment + itemised sources) ──────────────────────────────
// Compact "excel" cell inputs — theme tokens; the native period <select> popup is themed light on the public
// surface by the global .pleks-public select rule (app/globals.css). Flex-wrap so the row stacks on a 360px
// phone (label on its own line, amount + period below) rather than overflowing a rigid grid.
const CELL = "rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-mute)] focus:border-[var(--amber)] focus:outline-none"
const CELL_SELECT = `${CELL} appearance-none`
function StepIncome({ emp, setEmp, income, setIncome }: Readonly<{
  emp: Emp; setEmp: (v: Emp) => void; income: IncomeRow[]; setIncome: (v: IncomeRow[]) => void
}>) {
  function addCustom() { setIncome([...income, { key: `other_${income.length}`, label: "", amount: "", period: "month", custom: true }]) }
  function removeRow(i: number) { setIncome(income.filter((_, idx) => idx !== i)) }
  function updateRow(i: number, patch: Partial<IncomeRow>) { setIncome(income.map((r, idx) => idx === i ? { ...r, ...patch } : r)) }
  const total = totalMonthlyCents(income)
  const variable = emp.employment_type === "commission" || emp.employment_type === "self_employed"
  const probation = startedWithinProbation(emp.start_date)
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Income" sub="List every regular source — each counts towards what you can afford. Pick the period for each amount." />
      <FieldGrid>
        <SelectField label="Employment status" value={emp.employment_type} onChange={(v) => setEmp({ ...emp, employment_type: v })} required options={EMPLOYMENT_OPTIONS} />
        <TextField label="Date employed" type="date" value={emp.start_date} onChange={(v) => setEmp({ ...emp, start_date: v })} />
        <TextField label="Employer" value={emp.employer} onChange={(v) => setEmp({ ...emp, employer: v })} span placeholder="Company name" />
      </FieldGrid>
      {probation && (
        <p className="rounded-[var(--r-button)] border border-[var(--amber)] bg-[var(--amber-wash)] px-3 py-2 text-xs text-[var(--amber-ink)]">
          Started under {PROBATION_MONTHS} months ago — possibly still in a probation period. The agent sees this as context; it doesn&apos;t affect your score on its own.
        </p>
      )}
      {variable && (
        <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-xs text-[var(--ink-soft)]">
          Commission or variable income? Enter a typical month — we confirm the average from your bank statements.
        </p>
      )}

      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Sources of income</p>
        {/* column header — desktop only; widths mirror the rows below */}
        <div className="hidden items-center gap-2 px-0.5 pb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)] sm:flex">
          <span className="min-w-[140px] flex-1">Source</span>
          <span className="w-[120px]">Amount</span>
          <span className="w-[110px]">Period</span>
          <span className="size-7 shrink-0" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1.5">
          {income.map((r, i) => (
            <div key={`${r.key}-${i}`} className="flex flex-wrap items-center gap-2">
              {r.custom
                ? <input className={`${CELL} min-w-[140px] flex-1`} value={r.label} placeholder="Source name" maxLength={60} onChange={(e) => updateRow(i, { label: e.target.value })} />
                : <span className="min-w-[140px] flex-1 text-sm text-[var(--ink)]">{r.label}</span>}
              <input className={`${CELL} w-[120px]`} inputMode="numeric" value={r.amount} placeholder="R 0" onChange={(e) => updateRow(i, { amount: e.target.value })} />
              <select className={`${CELL_SELECT} w-[110px]`} value={r.period} onChange={(e) => updateRow(i, { period: e.target.value as IncomePeriod })}>
                {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {r.custom
                ? <button type="button" onClick={() => removeRow(i)} aria-label="Remove source" className="flex size-7 shrink-0 items-center justify-center text-[var(--ink-mute)] hover:text-red-600"><X className="size-4" /></button>
                : <span className="size-7 shrink-0" aria-hidden="true" />}
            </div>
          ))}
        </div>
        <button type="button" onClick={addCustom} className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
          <Plus className="size-4" /> Add other source
        </button>
      </div>

      {/* Total aligns under the Amount column (matching the input padding); "monthly" sits in the Period slot. */}
      <div className="flex items-center gap-2 border-t border-[var(--rule)] pt-3 text-sm">
        <span className="min-w-[140px] flex-1 text-[var(--ink-soft)]">Total monthly income (for affordability)</span>
        <span className="w-[120px] px-2.5 font-semibold text-[var(--ink)]">{formatZAR(total)}</span>
        <span className="w-[110px] text-[var(--ink-soft)]">monthly</span>
        <span className="size-7 shrink-0" aria-hidden="true" />
      </div>
    </div>
  )
}

// ── Invite capture (at type selection) — the co-applicant / company, captured up front ──
function roleLabels(commercial: boolean) {
  return { occ: commercial ? "On the lease" : "Lives here", guar: commercial ? "Surety" : "Guarantor" }
}
function InviteCapture({ type, commercial, coApplicants, setCoApplicants, company, setCompany }: Readonly<{
  type: ApplicantType; commercial: boolean
  coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
  company: CompanyInfo; setCompany: (v: CompanyInfo) => void
}>) {
  if (type === "company") {
    return (
      <div className="flex flex-col gap-4">
        <StepHeading title="The company applying" sub="Tell us about the business on the lease — you'll add your own details (as a director/signatory) next." />
        <FieldGrid>
          <SelectField label="Company type" value={company.companyType} onChange={(v) => setCompany({ ...company, companyType: v })} required options={COMPANY_TYPE_OPTIONS} />
          <TextField label="Registration number" value={company.companyReg} onChange={(v) => setCompany({ ...company, companyReg: v })} placeholder="e.g. 2019/123456/07 (if applicable)" />
        </FieldGrid>
        <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-xs text-[var(--ink-soft)]">
          Full company capture (every director/signatory) is being finalised — for now we record the company here and treat you as the contact. You can add director invites at the Applicants step.
        </p>
      </div>
    )
  }
  const { occ, guar } = roleLabels(commercial)
  const isGuar = type === "guarantor"
  const c = coApplicants[0] ?? blankCo(isGuar ? "guarantor" : "co_applicant")
  const update = (patch: Partial<CoApplicant>) => setCoApplicants([{ ...c, ...patch }, ...coApplicants.slice(1)])
  const heading = isGuar
    ? { title: commercial ? "Your surety" : "Your guarantor", sub: "They back the application financially and get their own secure link to consent + load their own documents." }
    : { title: "Who's applying with you?", sub: "Your co-applicant gets their own secure link to consent + load their own documents. We need their ID number to link them to this application." }
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title={heading.title} sub={heading.sub} />
      {!isGuar && (
        <div className="inline-flex w-fit rounded-[var(--r-button)] border border-[var(--rule)] p-0.5 text-xs">
          {(["co_applicant", "guarantor"] as const).map((r) => (
            <button key={r} type="button" onClick={() => update({ role: r })}
              className={`rounded-[var(--r-button)] px-2.5 py-1 transition-colors ${c.role === r ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-soft)]"}`}>
              {r === "co_applicant" ? occ : guar}
            </button>
          ))}
        </div>
      )}
      <FieldGrid>
        <TextField label="First name" value={c.firstName} onChange={(v) => update({ firstName: v })} required />
        <TextField label="Last name" value={c.lastName} onChange={(v) => update({ lastName: v })} />
        <TextField label="Email" type="email" value={c.email} onChange={(v) => update({ email: v })} required autoComplete="off" />
        <TextField label="ID number" value={c.idNumber} onChange={(v) => update({ idNumber: v })} required />
        <TextField label="Mobile" type="tel" value={c.phone} onChange={(v) => update({ phone: v })} span />
      </FieldGrid>
    </div>
  )
}

// ── Step 5 — Applicants (status roster) ──────────────────────────────────────────
function RosterRow({ title, detail, green }: Readonly<{ title: string; detail?: string; green: boolean }>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] px-4 py-3">
      <div className="min-w-0">
        <span className="block text-sm font-medium text-[var(--ink)]">{title}</span>
        {detail && <span className="block truncate text-xs text-[var(--ink-mute)]">{detail}</span>}
      </div>
      {green
        ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="size-4" /> Complete</span>
        : <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600"><AlertCircle className="size-4" /> Needs info</span>}
    </div>
  )
}
function StepApplicants({ type, commercial, coApplicants, setCoApplicants, company, primaryName }: Readonly<{
  type: ApplicantType; commercial: boolean
  coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
  company: CompanyInfo; primaryName: string
}>) {
  const { occ, guar } = roleLabels(commercial)
  const defaultRole: CoRole = type === "guarantor" ? "guarantor" : "co_applicant"
  let addLabel = "another applicant"
  if (type === "guarantor") addLabel = commercial ? "a surety" : "a guarantor"
  function add() { setCoApplicants([...coApplicants, blankCo(defaultRole)]) }
  function remove(i: number) { setCoApplicants(coApplicants.filter((_, idx) => idx !== i)) }
  function update(i: number, patch: Partial<CoApplicant>) { setCoApplicants(coApplicants.map((c, idx) => idx === i ? { ...c, ...patch } : c)) }
  const companyLabel = COMPANY_TYPE_OPTIONS.find((o) => o.value === company.companyType)?.label
  return (
    <div className="flex flex-col gap-3">
      <StepHeading title="Applicants" sub="Everyone on this application. Each gets their own secure link to consent and load their own documents — submit once everyone's details are complete." />
      <RosterRow title={`${primaryName} — primary applicant`} detail="Your details, documents & income" green />
      {type === "company" && <RosterRow title="Company" detail={[companyLabel, company.companyReg].filter(Boolean).join(" · ") || "Company details"} green={Boolean(company.companyType)} />}
      {coApplicants.map((c, i) => (
        c.invited
          ? <RosterRow key={i} title={[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email} detail={`${c.email} · invited (${c.role === "guarantor" ? guar : occ})`} green />
          : (
            <div key={i} className="rounded-[var(--r-button)] border border-[var(--rule)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{c.role === "guarantor" ? guar : "Co-applicant"}</span>
                <button type="button" onClick={() => remove(i)} className="inline-flex items-center gap-1 text-xs text-[var(--ink-mute)] hover:text-red-600"><X className="size-3.5" /> Remove</button>
              </div>
              <FieldGrid>
                <TextField label="First name" value={c.firstName} onChange={(v) => update(i, { firstName: v })} required />
                <TextField label="Last name" value={c.lastName} onChange={(v) => update(i, { lastName: v })} />
                <TextField label="Email" type="email" value={c.email} onChange={(v) => update(i, { email: v })} required autoComplete="off" />
                <TextField label="ID number" value={c.idNumber} onChange={(v) => update(i, { idNumber: v })} required />
              </FieldGrid>
            </div>
          )
      ))}
      <button type="button" onClick={add} className="inline-flex w-fit items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
        <Plus className="size-4" /> Add {addLabel}
      </button>
      <p className="text-xs text-[var(--ink-mute)]">Co-applicants are invited when you continue; each then completes their own details, documents and consent via their link.</p>
    </div>
  )
}

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

function StepDocuments({ categories, docFiles, escape, onUpload, onRemove, onRename, onEscape }: Readonly<{
  categories: DocCategory[]; docFiles: Record<string, DocFile[]>; escape: Record<string, boolean>
  onUpload: (key: string, f: File | null, single: boolean) => void; onRemove: (key: string, id: string) => void
  onRename: (key: string, id: string, name: string) => void; onEscape: (key: string, v: boolean) => void
}>) {
  const core = categories.filter((c) => !c.booster)
  const boosters = categories.filter((c) => c.booster)
  const render = (cat: DocCategory) => (
    <DocCategoryCard key={cat.key} cat={cat} files={docFiles[cat.key] ?? []} skipped={!!escape[cat.key]} onUpload={onUpload} onRemove={onRemove} onRename={onRename} onEscape={onEscape} />
  )
  return (
    <div className="flex flex-col gap-3">
      <StepHeading title="Upload your documents" sub="We ask for what matches the income you entered — supplying it gives you the strongest, fairest result." />
      {core.map(render)}
      {boosters.length > 0 && (
        <>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Optional — these can strengthen your application</p>
          {boosters.map(render)}
        </>
      )}
    </div>
  )
}

// ── Step 6 — Submit → processing → 14M two-axis ruling ───────────────────────────
const RULING_LABEL: Record<string, { label: string; cls: string; note: string }> = {
  strong:            { label: "Strong application",   cls: "text-emerald-600", note: "Well-evidenced and affordable." },
  adequate:          { label: "Looks good",           cls: "text-emerald-600", note: "A solid application — a few optional improvements below." },
  "needs-evidence":  { label: "Needs a bit more",     cls: "text-amber-600",   note: "Add the evidence below to strengthen your application." },
  "below-threshold": { label: "Affordability concern", cls: "text-red-600",    note: "Rent is high relative to your income — see the options below." },
}
const AFFORD_LABEL: Record<string, string> = {
  within: "Within the 30% guideline", marginal: "Marginally over guideline",
  below: "Over the 30% guideline", "demonstrated-override": "Proven by your payment history",
}
const CONF_LABEL: Record<string, string> = { strong: "Strong", adequate: "Adequate", "needs-evidence": "Needs evidence" }

function ProcessingView() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <Loader2 className="size-8 animate-spin text-[var(--amber-ink)]" />
      <div>
        <h2 className="text-xl font-medium text-[var(--ink)]">Checking your application…</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">We&apos;re reading your documents and matching them to what you&apos;ve told us. This usually takes under a minute — you can leave this open.</p>
      </div>
      <ul className="space-y-1 text-xs text-[var(--ink-mute)]">
        <li>Reading your uploaded documents</li>
        <li>Checking affordability &amp; income evidence</li>
        <li>Preparing your result</li>
      </ul>
    </div>
  )
}

function FailedView({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <AlertCircle className="size-8 text-amber-600" />
      <div>
        <h2 className="text-xl font-medium text-[var(--ink)]">We couldn&apos;t finish the check</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">Something interrupted the screening — your application is saved. Please try again.</p>
      </div>
      <ActionButton tone="primary" onClick={onRetry}>Try again</ActionButton>
    </div>
  )
}

function AmendBar({ onAmend, onRerun }: Readonly<{ onAmend: (s: number) => void; onRerun: () => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton tone="secondary" size="sm" icon={<Users className="size-4" />} onClick={() => onAmend(4)}>Add an applicant</ActionButton>
      <ActionButton tone="secondary" size="sm" icon={<Upload className="size-4" />} onClick={() => onAmend(3)}>Upload documents</ActionButton>
      <ActionButton tone="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => onAmend(0)}>Edit details</ActionButton>
      <ActionButton tone="primary" size="sm" onClick={onRerun}>Re-check</ActionButton>
    </div>
  )
}

function RulingView({ evaluation, onAmend, onRerun }: Readonly<{ evaluation: ScreeningEvaluation; onAmend: (s: number) => void; onRerun: () => void }>) {
  const r = RULING_LABEL[evaluation.ruling_tier] ?? RULING_LABEL["needs-evidence"]
  const todos = evaluation.flags.filter((f) => (f.type === "fixable" || f.type === "structural") && f.remediation)
  const positives = evaluation.flags.filter((f) => f.type === "override")
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Application submitted ✓" sub="Here's your pre-screen result. The final decision is the agent's — you can strengthen it any time." />
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-5">
        <div className="flex items-end justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Pre-screen result</span>
          <span className={`text-sm font-semibold ${r.cls}`}>{r.label}</span>
        </div>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">{r.note}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[var(--r-button)] border border-[var(--rule)] p-3">
            <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Affordability</span>
            <span className="mt-1 block text-sm font-medium text-[var(--ink)]">{evaluation.affordability_ratio_pct != null ? `${evaluation.affordability_ratio_pct}% of income` : "—"}</span>
            <span className="block text-xs text-[var(--ink-soft)]">{AFFORD_LABEL[evaluation.affordability_tier] ?? evaluation.affordability_tier}</span>
          </div>
          <div className="rounded-[var(--r-button)] border border-[var(--rule)] p-3">
            <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Confidence</span>
            <span className="mt-1 block text-sm font-medium text-[var(--ink)]">{CONF_LABEL[evaluation.confidence_tier] ?? evaluation.confidence_tier}</span>
            <span className="block text-xs text-[var(--ink-soft)]">How well your documents back it up</span>
          </div>
        </div>
      </div>
      {positives.map((f) => (
        <p key={f.key} className="flex items-start gap-2 rounded-[var(--r-button)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />{f.title}</p>
      ))}
      {todos.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Strengthen your application</p>
          <div className="flex flex-col gap-2">
            {todos.map((f) => (
              <div key={f.key} className="rounded-[var(--r-button)] border border-[var(--rule)] p-3">
                <span className="block text-sm font-medium text-[var(--ink)]">{f.title}</span>
                {f.remediation && <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">{f.remediation}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {evaluation.iteration_number < MAX_SCREENING_ITERATIONS ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--ink-mute)]">You can make <span className="font-medium text-[var(--ink-soft)]">one</span> round of changes and re-check — after that your agent reviews it.</p>
          <AmendBar onAmend={onAmend} onRerun={onRerun} />
        </div>
      ) : (
        <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-xs text-[var(--ink-soft)]">You&apos;ve used your re-check — your agent takes it from here and will be in touch.</p>
      )}
      <p className="text-xs text-[var(--ink-mute)]">We&apos;ve emailed your confirmation. The agent will be in touch about next steps.</p>
    </div>
  )
}

function StepSubmit({ form, emp, income, askingRentCents, consent, setConsent, coApplicants, screeningStatus, evaluation, onAmend, onRerun }: Readonly<{
  form: PartyFormState; emp: Emp; income: IncomeRow[]; askingRentCents: number; consent: boolean; setConsent: (v: boolean) => void
  coApplicants: CoApplicant[]; screeningStatus: ScreeningStatus; evaluation: ScreeningEvaluation | null
  onAmend: (s: number) => void; onRerun: () => void
}>) {
  if (screeningStatus === "processing") return <ProcessingView />
  if (screeningStatus === "failed") return <FailedView onRetry={onRerun} />
  if (screeningStatus === "done" && evaluation) return <RulingView evaluation={evaluation} onAmend={onAmend} onRerun={onRerun} />

  const name = [form.firstName, form.lastName].filter(Boolean).join(" ") || "—"
  const incomeCents = totalMonthlyCents(income)
  const namedSources = income.filter((r) => moneyCents(r.amount) > 0)
  const ratio = incomeCents > 0 ? Math.round((askingRentCents / incomeCents) * 100) : null
  const probation = startedWithinProbation(emp.start_date)
  const others = coApplicants.filter((c) => c.email.trim())
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Review & submit" sub="Check your details, then submit for a free pre-screen." />
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 text-sm">
        <Row k="Applicant" v={name} />
        <Row k="Email" v={form.email ?? "—"} />
        <Row k="Employment" v={emp.employment_type || "—"} />
        {emp.start_date && <Row k="Employed since" v={probation ? `${emp.start_date} · possible probation` : emp.start_date} />}
        <Row k="Total income" v={incomeCents > 0 ? formatZAR(incomeCents) + " /mo" : "—"} />
        {namedSources.map((r) => <Row key={r.key} k={`— ${r.label || "Other"}`} v={`${formatZAR(rowMonthlyCents(r))} /mo`} />)}
        <Row k="Rent-to-income" v={ratio != null ? `${ratio}%` : "—"} />
        {others.length > 0 && <Row k="Others" v={others.map((c) => c.role === "guarantor" ? "guarantor" : "co-applicant").join(", ")} />}
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[var(--amber)]" />
        <span className="text-[13px] leading-relaxed text-[var(--ink-soft)]">
          <ShieldCheck className="mr-1 inline size-3.5 text-[var(--ink-mute)]" />
          I consent to Pleks processing the information I&apos;ve provided to pre-screen this application (POPIA). No credit check is run unless I&apos;m shortlisted and consent again.
        </span>
      </label>
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
