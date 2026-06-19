"use client"

/**
 * app/(applicant)/apply/[slug]/preview/StepPanel.tsx — the interactive apply wizard (client island)
 *
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  A 4-card LANDING (application type) → a functional 6-step wizard wired to the REAL backend:
 *           Landing — Just me · Couple/multiple · Company · On behalf/guarantor (each a short blurb).
 *           1 Personal details — RESIDENTIAL types reuse the add-tenant capture (IndividualIdentity;
 *             SA-ID auto-fills DOB+gender). COMPANY (commercial) capture is the next build.
 *           2 Address — mandatory current address.
 *           3 Income — employment status + date employed + employer, then an "excel" sources-of-income grid
 *             (Employment gross + rental/dividends/maintenance/… + custom), each with a period
 *             (month/quarter/annual). The monthly total drives affordability → POST create (also persists
 *             the breakdown to applications.income_sources + employment_start_date; probation is inferred).
 *           4 Applicants — add others, each via their own email link, tagged co-applicant (lives here)
 *             or guarantor (doesn't) → POST /api/applications/[id]/co-applicant.
 *           5 Documents — upload to the application-docs bucket + AI detect (same as the live flow).
 *           6 Submit — POPIA consent → POST submit → reveal the pre-screen "application preview".
 *         The server page renders the shell + left cards and passes slug/orgId/rent + agent contact.
 */

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Plus, X, Upload, FileText, CheckCircle2, Loader2, AlertCircle, ShieldCheck, User, Users, Building2, HandCoins, ArrowLeft } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import type { LucideIcon } from "lucide-react"
import { IndividualIdentity, CompanyAddressSection } from "@/components/parties/partySteps"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import {
  validateIdentityCore, validateAddressStep,
  type PartyFormState, type PartyErrors, type PartyAddressInput, type PartyPerson, type PartyBankAccountInput,
} from "@/lib/parties/partyValidation"
import { formatZAR, startedWithinProbation, PROBATION_MONTHS } from "@/lib/constants"

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

const STEPS = ["Personal details", "Address", "Income", "Applicants", "Documents", "Submit"]

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

interface DocSlot {
  key: string; label: string; accept: string
  file: File | null; uploading: boolean; uploaded: boolean; storagePath: string | null
  detection?: string | null; error?: string | null
}
const INITIAL_DOCS: DocSlot[] = [
  { key: "id_document", label: "SA ID / Passport", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "payslip_1", label: "Payslip (most recent)", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "payslip_2", label: "Payslip 2", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "payslip_3", label: "Payslip 3", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "bank_statement", label: "3-month bank statement", accept: ".pdf", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "employment_letter", label: "Employment letter / contract", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
]

interface CoApplicant { firstName: string; lastName: string; email: string; phone: string; role: CoRole; invited: boolean }
interface PrescreenResult { score: number | null; affordabilityFlag: boolean; rentToIncomePct: number | null }

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

export function StepPanel({ slug, orgId, leaseType, askingRentCents, agentName, agentPhone, prefill }: Readonly<{
  slug: string; orgId: string; leaseType: "residential" | "commercial"; askingRentCents: number; agentName: string | null; agentPhone: string | null
  prefill?: Partial<PartyFormState> | null
}>) {
  const commercial = leaseType === "commercial"
  const [type, setType] = useState<ApplicantType | null>(null)
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)

  // Seed identity + address from the logged-in user's own record (financial/employment stay empty — re-confirmed).
  const [form, setForm] = useState<PartyFormState>({ idType: "sa_id", ...(prefill ?? {}) })
  const [errors, setErrors] = useState<PartyErrors>({})
  const [emp, setEmp] = useState<Emp>({ employment_type: "", employer: "", start_date: "" })
  const [income, setIncome] = useState<IncomeRow[]>(SEED_INCOME)
  const set: SetFn = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [coApplicants, setCoApplicants] = useState<CoApplicant[]>([])
  const [docs, setDocs] = useState<DocSlot[]>(INITIAL_DOCS)
  const [consent, setConsent] = useState(false)
  const [prescreen, setPrescreen] = useState<PrescreenResult | null>(null)

  function advance(to: number) { setStep(to); setMaxReached((m) => Math.max(m, to)) }

  function pickType(t: ApplicantType) {
    setType(t)
    setStep(0); setMaxReached(0)
    // Seed the Applicants step intent: couple = co-applicants who live here; guarantor = a non-occupant backer.
    if (t === "guarantor") setCoApplicants([{ firstName: "", lastName: "", email: "", phone: "", role: "guarantor", invited: false }])
    else if (t === "couple") setCoApplicants([{ firstName: "", lastName: "", email: "", phone: "", role: "co_applicant", invited: false }])
    else setCoApplicants([])
  }

  function backToTypes() {
    if (applicationId) return // can't change type after the application is created
    setType(null); setStep(0); setMaxReached(0); setErrors({})
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
  }

  function continueAddress() {
    const e = validateAddressStep(form, true)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("A current address is required."); return }
    advance(2)
  }

  async function createApplication() {
    if (applicationId) { advance(3); return } // already created (came back) — don't create a duplicate
    // Employment status only — a R0 primary (student/dependent) applies with a guarantor whose income is
    // captured separately, so don't force an income figure here.
    if (!emp.employment_type) { toast.error("Please select an employment status."); return }
    setBusy(true)
    try {
      const res = await fetch("/api/applications/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          first_name: form.firstName, last_name: form.lastName, email: form.email, phone: form.phone,
          id_type: form.idType || "sa_id", id_number: form.idNumber, date_of_birth: form.dob || "",
          employment_type: emp.employment_type, employer_name: emp.employer, employment_start_date: emp.start_date || "",
          // income_sources is the source of truth; gross_monthly_income (rands) is the derived total — the
          // route re-derives both from income_sources and stores gross_monthly_income_cents (cents).
          gross_monthly_income: String(totalMonthlyCents(income) / 100),
          income_sources: incomeSourcesPayload(income),
        }),
      })
      const json = await res.json() as { applicationId?: string; token?: string; error?: string }
      if (!res.ok || !json.applicationId || !json.token) { toast.error(json.error ?? "Could not start your application."); return }
      setApplicationId(json.applicationId)
      setToken(json.token)
      advance(3)
    } catch {
      toast.error("Could not start your application.")
    } finally {
      setBusy(false)
    }
  }

  async function inviteCoApplicants() {
    if (!applicationId) return
    const pending = coApplicants.filter((c) => !c.invited && c.email.trim() && c.firstName.trim())
    setBusy(true)
    try {
      for (const c of pending) {
        const res = await fetch(`/api/applications/${applicationId}/co-applicant`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone, role: c.role }),
        })
        if (!res.ok) toast.error(`Could not invite ${c.email}`)
      }
      setCoApplicants((prev) => prev.map((c) => ({ ...c, invited: c.email.trim() ? true : c.invited })))
      advance(4)
    } finally {
      setBusy(false)
    }
  }

  async function uploadDoc(index: number, file: File | null) {
    if (!file || !applicationId) return
    setDocs((prev) => prev.map((d, i) => i === index ? { ...d, file, uploading: true, error: null } : d))
    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "pdf"
      const key = docs[index].key
      const path = `applications/${orgId}/${applicationId}/${key}.${ext}`
      const { error: upErr } = await supabase.storage.from("application-docs").upload(path, file, { upsert: true })
      if (upErr) throw upErr
      let detection: string | null = null
      try {
        const res = await fetch(`/api/applications/${applicationId}/detect-document`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, docKey: key }),
        })
        if (res.ok) detection = ((await res.json()) as { summary?: string }).summary ?? null
      } catch { /* detection non-fatal */ }
      setDocs((prev) => prev.map((d, i) => i === index ? { ...d, uploading: false, uploaded: true, storagePath: path, detection } : d))
    } catch (err) {
      setDocs((prev) => prev.map((d, i) => i === index ? { ...d, uploading: false, error: err instanceof Error ? err.message : "Upload failed" } : d))
    }
  }

  async function finishDocuments() {
    if (!applicationId) return
    setBusy(true)
    try {
      const supabase = createClient()
      const bank = docs.find((d) => d.key === "bank_statement")
      await supabase.from("applications").update({ bank_statement_path: bank?.storagePath ?? null, stage1_status: "documents_submitted" }).eq("id", applicationId)
      if (bank?.storagePath) {
        void fetch(`/api/applications/${applicationId}/documents`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankStatementPath: bank.storagePath }),
        })
      }
      advance(5)
    } finally {
      setBusy(false)
    }
  }

  async function submitApplication() {
    if (!applicationId || !token) return
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      })
      const json = await res.json() as { ok?: boolean; prescreen?: { score: number; affordabilityFlag: boolean; rentToIncomePct: number | null }; error?: string }
      if (!res.ok || !json.ok) { toast.error(json.error ?? "Could not submit your application."); return }
      const incomeCents = totalMonthlyCents(income)
      const localRatio = incomeCents > 0 ? Math.round((askingRentCents / incomeCents) * 100) : null
      setPrescreen({ score: json.prescreen?.score ?? null, affordabilityFlag: !!json.prescreen?.affordabilityFlag, rentToIncomePct: json.prescreen?.rentToIncomePct ?? localRatio })
    } catch {
      toast.error("Could not submit your application.")
    } finally {
      setBusy(false)
    }
  }

  const allDocsUploaded = docs.every((d) => d.uploaded)
  const isCompany = type === "company"

  return (
    <main className="flex min-w-0 flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
      <div className="fs-panel mb-1.5 flex flex-1 flex-col [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0" style={{ maxWidth: "none", width: "100%" }}>
        <span className="fs-knob" aria-hidden="true" />

        {type === null ? (
          <div className="flex-1 py-3 [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:overflow-y-auto"><Landing onPick={pickType} commercial={commercial} /></div>
        ) : (
          <>
            <TabBar step={step} maxReached={maxReached} onJump={setStep} />
            <div className="flex-1 py-3 [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:overflow-y-auto">
              {step === 0 && <StepPersonal type={type} commercial={commercial} form={form} set={set} errors={errors} />}
              {step === 1 && <StepAddress form={form} set={set} errors={errors} />}
              {step === 2 && <StepIncome emp={emp} setEmp={setEmp} income={income} setIncome={setIncome} />}
              {step === 3 && <StepApplicants type={type} commercial={commercial} coApplicants={coApplicants} setCoApplicants={setCoApplicants} />}
              {step === 4 && <StepDocuments docs={docs} onUpload={uploadDoc} />}
              {step === 5 && <StepSubmit form={form} emp={emp} income={income} askingRentCents={askingRentCents} consent={consent} setConsent={setConsent} prescreen={prescreen} coApplicants={coApplicants} />}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-5 pt-4">
              <div className="flex items-center gap-3">
                {!prescreen && (
                  <ActionButton tone="secondary" icon={<ArrowLeft className="size-4" />} onClick={goBack} disabled={step === 0 && !!applicationId} className="min-w-[200px] justify-center">
                    {step === 0 ? "Back to application type" : "Back"}
                  </ActionButton>
                )}
              </div>
              {step === 0 && !isCompany && <Cta label="Continue" onClick={continueIdentity} busy={busy} />}
              {step === 1 && <Cta label="Continue" onClick={continueAddress} busy={busy} />}
              {step === 2 && <Cta label="Continue to applicants" onClick={createApplication} busy={busy} />}
              {step === 3 && <Cta label="Continue to documents" onClick={inviteCoApplicants} busy={busy} />}
              {step === 4 && <Cta label="Continue to review" onClick={finishDocuments} busy={busy} disabled={!allDocsUploaded} />}
              {step === 5 && !prescreen && <Cta label="Submit application" onClick={submitApplication} busy={busy} disabled={!consent} />}
            </div>
          </>
        )}

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--rule)] pt-4">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-soft)]">
            <span className="size-1.5 rounded-full" style={{ background: "var(--positive, #2f9e63)" }} /> {applicationId ? "Saved automatically" : "Free to start — no credit check at this stage"}
          </span>
          {(agentName || agentPhone) && <span className="text-[11px] text-[var(--ink-soft)]">Questions? {[agentName, agentPhone].filter(Boolean).join(" · ")}</span>}
        </div>
      </div>
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
  if (type === "company") {
    return <div className="rounded-[var(--r-button)] border border-dashed border-[var(--rule)] p-6 text-center text-sm text-[var(--ink-soft)]">Company applications (company + signatories) are the next build.</div>
  }
  const guarSub = commercial ? "First, the party who'll occupy the premises. You'll add the surety next." : "First, the person who'll live here (the tenant). You'll add the guarantor next."
  const sub = type === "guarantor" ? guarSub : "The main applicant's details. SA ID auto-fills date of birth and gender."
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

      <div className="flex items-center justify-between border-t border-[var(--rule)] pt-3 text-sm">
        <span className="text-[var(--ink-soft)]">Total monthly income (for affordability)</span>
        <span className="font-semibold text-[var(--ink)]">{formatZAR(total)}</span>
      </div>
    </div>
  )
}

// ── Step 3 — Applicants (co-applicants / guarantor) ──────────────────────────────
function StepApplicants({ type, commercial, coApplicants, setCoApplicants }: Readonly<{
  type: ApplicantType; commercial: boolean; coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
}>) {
  const defaultRole: CoRole = type === "guarantor" ? "guarantor" : "co_applicant"
  function add() { setCoApplicants([...coApplicants, { firstName: "", lastName: "", email: "", phone: "", role: defaultRole, invited: false }]) }
  function remove(i: number) { setCoApplicants(coApplicants.filter((_, idx) => idx !== i)) }
  function update(i: number, patch: Partial<CoApplicant>) { setCoApplicants(coApplicants.map((c, idx) => idx === i ? { ...c, ...patch } : c)) }

  const occLabel = commercial ? "On the lease" : "Lives here"
  const guarLabel = commercial ? "Surety" : "Guarantor"
  const addGuarLabel = commercial ? "a surety" : "a guarantor"
  const guarHeading = commercial
    ? { title: "Your surety", sub: "The party backing the application financially. They won't be on the lease, but they'll get their own secure link to consent." }
    : { title: "Your guarantor", sub: "The person backing your application financially. They won't live here, but they'll get their own secure link to consent." }
  const otherHeading = commercial
    ? { title: "Other parties on the lease?", sub: "Add the other parties on the lease — each gets their own secure link." }
    : { title: "Anyone applying with you?", sub: "Add other adults who'll live here — each gets their own secure link. Adding earners can also improve affordability." }
  const heading = type === "guarantor" ? guarHeading : otherHeading

  return (
    <div className="flex flex-col gap-4">
      <StepHeading title={heading.title} sub={heading.sub} />
      {coApplicants.length === 0 && (
        <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-4 py-3 text-sm text-[var(--ink-soft)]">Applying on your own? Just continue.</p>
      )}
      {coApplicants.map((c, i) => (
        <div key={i} className="rounded-[var(--r-button)] border border-[var(--rule)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{c.role === "guarantor" ? guarLabel : "Co-applicant"}{c.invited ? " · invited" : ""}</span>
            {!c.invited && <button type="button" onClick={() => remove(i)} className="inline-flex items-center gap-1 text-xs text-[var(--ink-mute)] hover:text-red-600"><X className="size-3.5" /> Remove</button>}
          </div>
          {!c.invited && (
            <div className="mb-3 inline-flex rounded-[var(--r-button)] border border-[var(--rule)] p-0.5 text-xs">
              {(["co_applicant", "guarantor"] as const).map((r) => (
                <button key={r} type="button" onClick={() => update(i, { role: r })}
                  className={`rounded-[var(--r-button)] px-2.5 py-1 transition-colors ${c.role === r ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-soft)]"}`}>
                  {r === "co_applicant" ? occLabel : guarLabel}
                </button>
              ))}
            </div>
          )}
          <FieldGrid>
            <TextField label="First name" value={c.firstName} onChange={(v) => update(i, { firstName: v })} required />
            <TextField label="Last name" value={c.lastName} onChange={(v) => update(i, { lastName: v })} />
            <TextField label="Email" type="email" value={c.email} onChange={(v) => update(i, { email: v })} required span />
            <TextField label="Mobile" type="tel" value={c.phone} onChange={(v) => update(i, { phone: v })} />
          </FieldGrid>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex w-fit items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
        <Plus className="size-4" /> Add {type === "guarantor" ? addGuarLabel : "another person"}
      </button>
    </div>
  )
}

// ── Step 4 — Documents ───────────────────────────────────────────────────────────
function StepDocuments({ docs, onUpload }: Readonly<{ docs: DocSlot[]; onUpload: (i: number, f: File | null) => void }>) {
  const done = docs.filter((d) => d.uploaded).length
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Upload your documents" sub={`Take a photo or upload a file. ${done}/${docs.length} uploaded.`} />
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--paper-sunk)]">
        <div className="h-full rounded-full bg-[var(--amber)] transition-all" style={{ width: `${(done / docs.length) * 100}%` }} />
      </div>
      <div className="grid gap-2">
        {docs.map((doc, i) => {
          let icon = <Upload className="size-5 text-[var(--ink-mute)]" />
          if (doc.uploading) icon = <Loader2 className="size-5 animate-spin text-[var(--amber-ink)]" />
          else if (doc.uploaded) icon = <CheckCircle2 className="size-5 text-emerald-600" />
          else if (doc.error) icon = <AlertCircle className="size-5 text-red-600" />
          return (
            <label key={doc.key} className="flex cursor-pointer items-start gap-3 rounded-[var(--r-button)] border border-[var(--rule)] p-3 transition-colors hover:bg-[var(--paper-sunk)]">
              <span className="mt-0.5 shrink-0">{icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--ink)]">{doc.label}</span>
                {doc.file && <span className="block truncate text-xs text-[var(--ink-mute)]">{doc.file.name}</span>}
                {doc.detection && <span className="block text-xs text-emerald-600">{doc.detection}</span>}
                {doc.error && <span className="block text-xs text-red-600">{doc.error}</span>}
              </span>
              <FileText className="mt-0.5 size-4 shrink-0 text-[var(--ink-mute)]" />
              <input type="file" accept={doc.accept} className="sr-only" onChange={(e) => onUpload(i, e.target.files?.[0] ?? null)} />
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 5 — Submit & preview ────────────────────────────────────────────────────
function prescreenLabel(score: number | null): { label: string; cls: string } {
  if (score == null) return { label: "Pending", cls: "text-[var(--ink-mute)]" }
  if (score >= 35) return { label: "Strong", cls: "text-emerald-600" }
  if (score >= 25) return { label: "Good", cls: "text-emerald-600" }
  if (score >= 18) return { label: "Borderline", cls: "text-amber-600" }
  return { label: "Needs a closer look", cls: "text-red-600" }
}

function StepSubmit({ form, emp, income, askingRentCents, consent, setConsent, prescreen, coApplicants }: Readonly<{
  form: PartyFormState; emp: Emp; income: IncomeRow[]; askingRentCents: number; consent: boolean; setConsent: (v: boolean) => void
  prescreen: PrescreenResult | null; coApplicants: CoApplicant[]
}>) {
  const name = [form.firstName, form.lastName].filter(Boolean).join(" ") || "—"
  const incomeCents = totalMonthlyCents(income)
  const namedSources = income.filter((r) => moneyCents(r.amount) > 0)
  const ratio = incomeCents > 0 ? Math.round((askingRentCents / incomeCents) * 100) : null
  const probation = startedWithinProbation(emp.start_date)
  const others = coApplicants.filter((c) => c.email.trim())

  if (prescreen) {
    const { label, cls } = prescreenLabel(prescreen.score)
    const pct = prescreen.score != null ? Math.round((prescreen.score / 45) * 100) : 0
    return (
      <div className="flex flex-col gap-4">
        <StepHeading title="Application submitted ✓" sub="Here's your pre-screen indication. The final decision is made by the agent." />
        <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-5">
          <div className="flex items-end justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Pre-screen indication</span>
            <span className={`text-sm font-semibold ${cls}`}>{label}</span>
          </div>
          <p className="mt-1 text-3xl font-medium text-[var(--ink)]">{prescreen.score ?? "—"}<span className="text-base text-[var(--ink-mute)]"> / 45</span></p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--paper-sunk)]">
            <div className="h-full rounded-full bg-[var(--amber)] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            Rent is {ratio != null ? `${ratio}%` : "—"} of your stated income{prescreen.affordabilityFlag ? " — above the 30% guideline. Adding an earning applicant can improve this." : " — within the 30% guideline."}
          </p>
        </div>
        <p className="text-xs text-[var(--ink-mute)]">We&apos;ve emailed your confirmation. The agent will be in touch about next steps.</p>
      </div>
    )
  }

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
