"use client"

/**
 * app/(applicant)/apply/[slug]/preview/StepPanel.tsx — the interactive apply wizard (client island)
 *
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  Functional 5-step apply flow wired to the REAL backend, walkable end-to-end:
 *           1 Personal details — RESIDENTIAL reuses the add-tenant capture (IndividualIdentity: SA-ID
 *             auto-fills DOB+gender). COMMERCIAL (company) path is the next build.
 *           2 Address & employment — mandatory current address + employment/income →
 *             POST /api/applications/create (needs identity + employment).
 *           3 Applicants — add co-applicants (name+email) → POST /api/applications/[id]/co-applicant.
 *           4 Documents — upload to the application-docs bucket + AI detect (same as the live flow).
 *           5 Submit — POPIA consent → POST /api/applications/[id]/submit → reveal the pre-screen result
 *             (the applicant "application preview": score/45 + affordability).
 *         The server page renders the shell + left cards and passes slug/orgId/rent + agent contact.
 */

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Plus, X, Upload, FileText, CheckCircle2, Loader2, AlertCircle, ShieldCheck } from "lucide-react"
import { IndividualIdentity, CompanyAddressSection } from "@/components/parties/partySteps"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import {
  validateIdentityCore, validateAddressStep,
  type PartyFormState, type PartyErrors, type PartyAddressInput, type PartyPerson, type PartyBankAccountInput,
} from "@/lib/parties/partyValidation"
import { formatZAR } from "@/lib/constants"

const STEPS = ["Personal details", "Address & employment", "Applicants", "Documents", "Submit"]

const EMPLOYMENT_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "permanent", label: "Permanently employed" },
  { value: "contract", label: "Contract" },
  { value: "self_employed", label: "Self-employed" },
  { value: "part_time", label: "Part-time" },
  { value: "retired", label: "Retired" },
  { value: "unemployed", label: "Unemployed" },
  { value: "other", label: "Other" },
]

type SetFn = (k: keyof PartyFormState, v: string | string[] | boolean | PartyPerson[] | PartyAddressInput[] | PartyBankAccountInput[]) => void
type Emp = { employment_type: string; employer: string; gross_income: string }

interface DocSlot {
  key: string
  label: string
  accept: string
  file: File | null
  uploading: boolean
  uploaded: boolean
  storagePath: string | null
  detection?: string | null
  error?: string | null
}
const INITIAL_DOCS: DocSlot[] = [
  { key: "id_document", label: "SA ID / Passport", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "payslip_1", label: "Payslip (most recent)", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "payslip_2", label: "Payslip 2", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "payslip_3", label: "Payslip 3", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "bank_statement", label: "3-month bank statement", accept: ".pdf", file: null, uploading: false, uploaded: false, storagePath: null },
  { key: "employment_letter", label: "Employment letter / contract", accept: ".pdf,.jpg,.jpeg,.png", file: null, uploading: false, uploaded: false, storagePath: null },
]

interface CoApplicant { firstName: string; lastName: string; email: string; phone: string; invited: boolean }
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
          <button
            key={label}
            type="button"
            disabled={!reachable}
            onClick={() => reachable && onJump(i)}
            className={`flex items-center gap-2 pb-2.5 text-[13px] ${tabClass(done, cur)} ${reachable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
          >
            <span className={`flex size-[18px] items-center justify-center rounded-full text-[10px] ${circleClass(done, cur)}`}>{done ? "✓" : i + 1}</span>
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Segmented({ value, onChange, disabled }: Readonly<{ value: string; onChange: (v: string) => void; disabled?: boolean }>) {
  return (
    <div className="inline-flex rounded-[var(--r-button)] border border-[var(--rule)] p-0.5">
      {["Residential", "Commercial"].map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o)}
          className={`rounded-[var(--r-button)] px-4 py-1.5 text-sm transition-colors disabled:opacity-50 ${value === o ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Footer CTA in the door grammar (.fs-cta). */
function Cta({ label, onClick, busy, disabled }: Readonly<{ label: string; onClick: () => void; busy?: boolean; disabled?: boolean }>) {
  return (
    <button type="button" className="fs-cta" style={{ maxWidth: 300 }} onClick={onClick} disabled={busy || disabled}>
      <span className="fs-cta-bar" aria-hidden="true" />
      <span className="fs-cta-label">{busy ? "Working…" : label}</span>
      <span className="fs-cta-arrow" aria-hidden="true">→</span>
    </button>
  )
}

export function StepPanel({ slug, orgId, askingRentCents, agentName, agentPhone }: Readonly<{
  slug: string; orgId: string; askingRentCents: number; agentName: string | null; agentPhone: string | null
}>) {
  const [step, setStep] = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [lease, setLease] = useState<"Residential" | "Commercial">("Residential")

  const [form, setForm] = useState<PartyFormState>({ idType: "sa_id" })
  const [errors, setErrors] = useState<PartyErrors>({})
  const [emp, setEmp] = useState<Emp>({ employment_type: "", employer: "", gross_income: "" })
  const set: SetFn = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [coApplicants, setCoApplicants] = useState<CoApplicant[]>([])
  const [docs, setDocs] = useState<DocSlot[]>(INITIAL_DOCS)
  const [consent, setConsent] = useState(false)
  const [prescreen, setPrescreen] = useState<PrescreenResult | null>(null)

  function advance(to: number) { setStep(to); setMaxReached((m) => Math.max(m, to)) }

  // Step 1 → 2: validate identity only
  function continueIdentity() {
    const e = validateIdentityCore("individual", form, true)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("Please complete the highlighted fields."); return }
    advance(1)
  }

  // Step 2 → 3: validate address + employment, then create the application
  async function createApplication() {
    const e = validateAddressStep(form, true)
    setErrors(e)
    const empMissing = !emp.employment_type || !emp.gross_income.trim()
    if (Object.keys(e).length > 0 || empMissing) {
      toast.error(empMissing ? "Employment status and gross monthly income are required." : "A current address is required.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/applications/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          first_name: form.firstName, last_name: form.lastName, email: form.email, phone: form.phone,
          id_type: form.idType || "sa_id", id_number: form.idNumber, date_of_birth: form.dob || "",
          employment_type: emp.employment_type, employer_name: emp.employer,
          gross_monthly_income: emp.gross_income.replace(/[^\d.]/g, ""),
        }),
      })
      const json = await res.json() as { applicationId?: string; token?: string; error?: string }
      if (!res.ok || !json.applicationId || !json.token) { toast.error(json.error ?? "Could not start your application."); return }
      setApplicationId(json.applicationId)
      setToken(json.token)
      advance(2)
    } catch {
      toast.error("Could not start your application.")
    } finally {
      setBusy(false)
    }
  }

  // Step 3 → 4: invite co-applicants
  async function inviteCoApplicants() {
    if (!applicationId) return
    const pending = coApplicants.filter((c) => !c.invited && c.email.trim() && c.firstName.trim())
    setBusy(true)
    try {
      for (const c of pending) {
        const res = await fetch(`/api/applications/${applicationId}/co-applicant`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone }),
        })
        if (!res.ok) toast.error(`Could not invite ${c.email}`)
      }
      setCoApplicants((prev) => prev.map((c) => ({ ...c, invited: c.email.trim() ? true : c.invited })))
      advance(3)
    } finally {
      setBusy(false)
    }
  }

  // Step 4: document upload
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
      await supabase.from("applications").update({
        bank_statement_path: bank?.storagePath ?? null,
        stage1_status: "documents_submitted",
      }).eq("id", applicationId)
      if (bank?.storagePath) {
        void fetch(`/api/applications/${applicationId}/documents`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankStatementPath: bank.storagePath }),
        })
      }
      advance(4)
    } finally {
      setBusy(false)
    }
  }

  // Step 5: consent + submit → reveal pre-screen
  async function submitApplication() {
    if (!applicationId || !token) return
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const json = await res.json() as { ok?: boolean; prescreen?: { score: number; affordabilityFlag: boolean; rentToIncomePct: number | null }; error?: string }
      if (!res.ok || !json.ok) { toast.error(json.error ?? "Could not submit your application."); return }
      const incomeCents = Math.round(parseFloat(emp.gross_income.replace(/[^\d.]/g, "") || "0") * 100)
      const localRatio = incomeCents > 0 ? Math.round((askingRentCents / incomeCents) * 100) : null
      setPrescreen({
        score: json.prescreen?.score ?? null,
        affordabilityFlag: !!json.prescreen?.affordabilityFlag,
        rentToIncomePct: json.prescreen?.rentToIncomePct ?? localRatio,
      })
    } catch {
      toast.error("Could not submit your application.")
    } finally {
      setBusy(false)
    }
  }

  const allDocsUploaded = docs.every((d) => d.uploaded)
  const commercial = lease === "Commercial"

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="fs-panel mb-1.5 flex flex-1 flex-col" style={{ maxWidth: "none", width: "100%" }}>
        <span className="fs-knob" aria-hidden="true" />
        <TabBar step={step} maxReached={maxReached} onJump={setStep} />

        <div className="flex flex-1 flex-col gap-4 py-3">
          {step === 0 && <StepPersonal lease={lease} setLease={setLease} form={form} set={set} errors={errors} locked={!!applicationId} />}
          {step === 1 && <StepAddressEmployment form={form} set={set} errors={errors} emp={emp} setEmp={setEmp} />}
          {step === 2 && <StepApplicants coApplicants={coApplicants} setCoApplicants={setCoApplicants} />}
          {step === 3 && <StepDocuments docs={docs} onUpload={uploadDoc} />}
          {step === 4 && <StepSubmit form={form} emp={emp} askingRentCents={askingRentCents} consent={consent} setConsent={setConsent} prescreen={prescreen} coApplicants={coApplicants} />}

          <div className="mt-auto flex items-center justify-between gap-3 pt-2">
            <span className="text-[11px] text-[var(--ink-mute)]">{prescreen ? "Submitted" : `Step ${step + 1} of ${STEPS.length}`}</span>
            {step === 0 && !commercial && <Cta label="Continue" onClick={continueIdentity} busy={busy} />}
            {step === 1 && <Cta label="Continue to applicants" onClick={createApplication} busy={busy} />}
            {step === 2 && <Cta label="Continue to documents" onClick={inviteCoApplicants} busy={busy} />}
            {step === 3 && <Cta label="Continue to review" onClick={finishDocuments} busy={busy} disabled={!allDocsUploaded} />}
            {step === 4 && !prescreen && <Cta label="Submit application" onClick={submitApplication} busy={busy} disabled={!consent} />}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--rule)] pt-4">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-soft)]">
            <span className="size-1.5 rounded-full" style={{ background: "var(--positive, #2f9e63)" }} /> {applicationId ? "Saved automatically" : "Free to start — no credit check at this stage"}
          </span>
          {(agentName || agentPhone) && (
            <span className="text-[11px] text-[var(--ink-soft)]">Questions? {[agentName, agentPhone].filter(Boolean).join(" · ")}</span>
          )}
        </div>
      </div>
    </main>
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
function StepPersonal({ lease, setLease, form, set, errors, locked }: Readonly<{
  lease: "Residential" | "Commercial"; setLease: (v: "Residential" | "Commercial") => void
  form: PartyFormState; set: SetFn; errors: PartyErrors; locked: boolean
}>) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Tell us about you" sub="A few details to start your application — free, no credit check at this stage. We collect consent later if you're shortlisted." />
      <Segmented value={lease} onChange={(v) => setLease(v as "Residential" | "Commercial")} disabled={locked} />
      {lease === "Residential" ? (
        <IndividualIdentity f={form} set={set} errors={errors} fullFica stepNumber="" />
      ) : (
        <div className="rounded-[var(--r-button)] border border-dashed border-[var(--rule)] p-6 text-center text-sm text-[var(--ink-soft)]">
          Commercial applications (company + signatories) are the next build.
        </div>
      )}
    </div>
  )
}

// ── Step 2 — Address & employment ────────────────────────────────────────────────
function StepAddressEmployment({ form, set, errors, emp, setEmp }: Readonly<{
  form: PartyFormState; set: SetFn; errors: PartyErrors; emp: Emp; setEmp: (v: Emp) => void
}>) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Where you live & what you earn" sub="Your current address and income help us pre-screen affordability." />
      <CompanyAddressSection n="" title="Current address" optional={false} addresses={form.addresses ?? []} onChange={(a) => set("addresses", a)} error={errors.addresses} />
      <div className="mt-2">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Employment &amp; income</p>
        <FieldGrid>
          <SelectField label="Employment status" value={emp.employment_type} onChange={(v) => setEmp({ ...emp, employment_type: v })} required options={EMPLOYMENT_OPTIONS} />
          <TextField label="Gross monthly income" value={emp.gross_income} onChange={(v) => setEmp({ ...emp, gross_income: v })} required placeholder="R 0" />
          <TextField label="Employer" value={emp.employer} onChange={(v) => setEmp({ ...emp, employer: v })} span placeholder="Company name" />
        </FieldGrid>
      </div>
    </div>
  )
}

// ── Step 3 — Applicants ──────────────────────────────────────────────────────────
function StepApplicants({ coApplicants, setCoApplicants }: Readonly<{
  coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
}>) {
  function add() { setCoApplicants([...coApplicants, { firstName: "", lastName: "", email: "", phone: "", invited: false }]) }
  function remove(i: number) { setCoApplicants(coApplicants.filter((_, idx) => idx !== i)) }
  function update(i: number, patch: Partial<CoApplicant>) { setCoApplicants(coApplicants.map((c, idx) => idx === i ? { ...c, ...patch } : c)) }
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Anyone applying with you?" sub="Add other adults who'll be on the lease. We'll email each of them their own secure link — adding earners can also improve affordability." />
      {coApplicants.length === 0 && (
        <p className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-4 py-3 text-sm text-[var(--ink-soft)]">Applying on your own? Just continue.</p>
      )}
      {coApplicants.map((c, i) => (
        <div key={i} className="rounded-[var(--r-button)] border border-[var(--rule)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">Applicant {i + 2}{c.invited ? " · invited" : ""}</span>
            {!c.invited && <button type="button" onClick={() => remove(i)} className="inline-flex items-center gap-1 text-xs text-[var(--ink-mute)] hover:text-red-600"><X className="size-3.5" /> Remove</button>}
          </div>
          <FieldGrid>
            <TextField label="First name" value={c.firstName} onChange={(v) => update(i, { firstName: v })} required />
            <TextField label="Last name" value={c.lastName} onChange={(v) => update(i, { lastName: v })} />
            <TextField label="Email" type="email" value={c.email} onChange={(v) => update(i, { email: v })} required span />
            <TextField label="Mobile" type="tel" value={c.phone} onChange={(v) => update(i, { phone: v })} />
          </FieldGrid>
        </div>
      ))}
      <button type="button" onClick={add} className="inline-flex w-fit items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
        <Plus className="size-4" /> Add another applicant
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

function StepSubmit({ form, emp, askingRentCents, consent, setConsent, prescreen, coApplicants }: Readonly<{
  form: PartyFormState; emp: Emp; askingRentCents: number; consent: boolean; setConsent: (v: boolean) => void
  prescreen: PrescreenResult | null; coApplicants: CoApplicant[]
}>) {
  const name = [form.firstName, form.lastName].filter(Boolean).join(" ") || "—"
  const incomeCents = Math.round(parseFloat(emp.gross_income.replace(/[^\d.]/g, "") || "0") * 100)
  const ratio = incomeCents > 0 ? Math.round((askingRentCents / incomeCents) * 100) : null
  const invited = coApplicants.filter((c) => c.email.trim()).length

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
        <Row k="Gross income" v={incomeCents > 0 ? formatZAR(incomeCents) + " /mo" : "—"} />
        <Row k="Rent-to-income" v={ratio != null ? `${ratio}%` : "—"} />
        {invited > 0 && <Row k="Co-applicants" v={`${invited} invited`} />}
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
