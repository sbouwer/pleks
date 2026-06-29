"use client"

/**
 * app/(applicant)/apply/co-applicant/[token]/CoApplicantSession.tsx — the co-applicant's identity+marital+consent form.
 *
 * Notes:  ADDENDUM_14Q §10 increment 1. Reuses IndividualIdentity (identity + marital). The invite link (sent to the
 *         co's email) IS the email-possession proof, so no separate OTP this increment; the consent tick is the
 *         sign-off. On submit → POST .../save → sets stage1_consent_given (unlocks the J1 gate + hub status + the 14M
 *         marital flags). If the primary linked this co as their in-community spouse, the marriage is pre-filled to
 *         confirm (14M §1). Income + documents are a later increment.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Clock } from "lucide-react"
import { IndividualIdentity } from "@/components/parties/partySteps"
import { ActionButton } from "@/components/ui/actions"
import { validateIdentityCore, validateAddressStep, type PartyFormState, type PartyErrors } from "@/lib/parties/partyValidation"
import { StepAddress, StepEmployment, StepIncome, StepExpenses, StepDocuments } from "../../[slug]/applyIndividual"
import {
  type Emp, type IncomeRow, type DocFile, SELF_EMPLOYED_TYPES,
  seedIncomeFor, seedCommitments, allAmountsEmpty, intOrNull, posOrNull,
  rowMonthlyCents, totalMonthlyCents, incomeSourcesPayload, incomeKeys,
} from "../../[slug]/applyDomain"
import { createClient } from "@/lib/supabase/client"
import { validateUpload } from "@/lib/extraction/uploadValidator"
import { deriveDocCategories } from "@/lib/applications/docCategories"

export interface SpouseCandidate { firstName: string; lastName: string; email: string; idNumber: string }
export interface CoPrefill { maritalStatus: string | null; matrimonialRegime: string | null; spouseIsCoApplicant: boolean | null; linkedAsSpouse: boolean }
interface CoData { firstName: string; lastName: string; idType: string; idNumber: string; email: string; phone: string; currentAddress: Record<string, unknown> | null }

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-4 p-4">
      <div className="fs-panel flex flex-col gap-5" style={{ maxWidth: "none", width: "100%" }}>{children}</div>
    </div>
  )
}

export function CoApplicantSession({ token, orgId, applicationId, coId, expired, alreadyDone, co, prefill, primaryCandidate, primaryName, unitLabel }: Readonly<{
  token: string; orgId: string; applicationId: string; coId: string; expired: boolean; alreadyDone: boolean
  co: CoData; prefill: CoPrefill; primaryCandidate: SpouseCandidate | null; primaryName: string; unitLabel: string
}>) {
  const [form, setForm] = useState<PartyFormState>({
    idType: co.idType || "sa_id", firstName: co.firstName, lastName: co.lastName, idNumber: co.idNumber, email: co.email, phone: co.phone,
    maritalStatus: prefill.maritalStatus ?? undefined, matrimonialRegime: prefill.matrimonialRegime ?? undefined,
    spouseIsCoApplicant: prefill.spouseIsCoApplicant ?? undefined,
    addresses: (co.currentAddress as unknown as PartyFormState["addresses"]) ?? undefined,
  } as PartyFormState)
  const [errors, setErrors] = useState<PartyErrors>({})
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(alreadyDone)
  const set = (k: keyof PartyFormState, v: PartyFormState[keyof PartyFormState]) => setForm((p) => ({ ...p, [k]: v }))

  // Finances (the co's own declared income/obligations — feeds combined affordability, ADDENDUM_14Q §10 inc 2).
  const [emp, setEmp] = useState<Emp>({ employment_type: "", employer: "", start_date: "" })
  const [income, setIncome] = useState<IncomeRow[]>([])
  const [commitments, setCommitments] = useState<IncomeRow[]>([])
  const [dependentAdults, setDependentAdults] = useState("")
  const [dependentMinors, setDependentMinors] = useState("")
  // Seed the income grid from the chosen employment status (only while nothing's typed) + the common commitments once.
  useEffect(() => { if (emp.employment_type) setIncome((cur) => (allAmountsEmpty(cur) ? seedIncomeFor(emp.employment_type) : cur)) }, [emp.employment_type])
  useEffect(() => { setCommitments((c) => (c.length === 0 ? seedCommitments() : c)) }, [])

  // Documents (14P 0b.5) — the director's own docs upload to their co_{coId}/ subfolder, isolated from the primary's
  // (no flat-path collision) and registered to THIS subject (detect-document infers it from the co_ path). Optional
  // at Step 1 (declared is enough); uploading is how the director's surety gets VERIFIED + credited in the pool.
  const [docFiles, setDocFiles] = useState<Record<string, DocFile[]>>({})
  const [docEscape, setDocEscape] = useState<Record<string, boolean>>({})
  const docCategories = deriveDocCategories(incomeKeys(income), emp.employment_type, form.idType, "individual", undefined, emp.sars_registered)

  async function uploadDoc(categoryKey: string, file: File | null, single: boolean) {
    if (!file) return
    const fileId = `${categoryKey}_${crypto.randomUUID().slice(0, 8)}`
    const entry: DocFile = { id: fileId, name: file.name, uploading: true, uploaded: false, storagePath: null }
    setDocFiles((prev) => ({ ...prev, [categoryKey]: single ? [entry] : [...(prev[categoryKey] ?? []), entry] }))
    const patch = (p: Partial<DocFile>) => setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).map((f) => f.id === fileId ? { ...f, ...p } : f) }))
    const bytes = new Uint8Array(await file.arrayBuffer())
    const check = validateUpload(file.name, file.type, bytes)
    if (!check.valid) { patch({ uploading: false, error: check.userMessage ?? "File not accepted." }); toast.error(check.userMessage?.split("\n")[0] ?? "File not accepted."); return }
    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "pdf"
      const path = `applications/${orgId}/${applicationId}/co_${coId}/${single ? categoryKey : fileId}.${ext}`
      const { error: upErr } = await supabase.storage.from("application-docs").upload(path, file, { upsert: true })
      if (upErr) throw upErr
      try {
        const res = await fetch(`/api/applications/${applicationId}/detect-document`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, docKey: categoryKey }) })
        if (res.status === 422) {
          const b = await res.json().catch(() => ({})) as { message?: string }
          const msg = b.message ?? "This file is password-protected — please upload an unprotected version."
          try { await supabase.storage.from("application-docs").remove([path]) } catch { /* best-effort */ }
          patch({ uploading: false, error: msg }); toast.error(msg); return
        }
      } catch { /* detection non-fatal */ }
      patch({ uploading: false, uploaded: true, storagePath: path })
    } catch (err) { patch({ uploading: false, error: err instanceof Error ? err.message : "Upload failed" }) }
  }
  async function removeDoc(categoryKey: string, fileId: string) {
    const f = (docFiles[categoryKey] ?? []).find((x) => x.id === fileId)
    setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).filter((x) => x.id !== fileId) }))
    if (f?.storagePath) { try { await createClient().storage.from("application-docs").remove([f.storagePath]) } catch { /* best-effort */ } }
  }
  function renameDoc(categoryKey: string, fileId: string, name: string) {
    setDocFiles((prev) => ({ ...prev, [categoryKey]: (prev[categoryKey] ?? []).map((f) => f.id === fileId ? { ...f, name } : f) }))
  }

  if (expired) return (
    <Shell><div className="flex flex-col items-center gap-3 py-8 text-center">
      <Clock className="size-10 text-[var(--ink-mute)]" />
      <h1 className="text-xl font-semibold text-[var(--ink)]">Your invite has expired</h1>
      <p className="text-sm text-[var(--ink-soft)]">Please ask the main applicant to resend your invitation link.</p>
    </div></Shell>
  )
  if (done) return (
    <Shell><div className="flex flex-col items-center gap-3 py-8 text-center">
      <CheckCircle2 className="size-10 text-emerald-600" />
      <h1 className="text-xl font-semibold text-[var(--ink)]">Your part is done ✓</h1>
      <p className="text-sm text-[var(--ink-soft)]">Thanks — your details and consent are in. The application goes to the agent once everyone on it has finished their part. You can close this page.</p>
    </div></Shell>
  )

  function resolveSpouse(): Record<string, unknown> | null {
    if (form.maritalStatus !== "married" || form.matrimonialRegime !== "in_community") return null
    if (form.spouseIsCoApplicant && primaryCandidate) return { isCoApplicant: true, idNumber: primaryCandidate.idNumber, email: primaryCandidate.email || null }
    return { firstName: form.spouseFirstName ?? "", lastName: form.spouseLastName ?? "", idNumber: form.spouseIdNumber ?? "", email: form.spouseEmail ?? "" }
  }

  async function submit() {
    const e = { ...validateIdentityCore("individual", form, true), ...validateAddressStep(form, true) }
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("Please complete the highlighted fields."); return }
    if (!emp.employment_type) { toast.error("Please select your employment status."); return }
    if (!consent) { toast.error("Please tick the consent box to continue."); return }
    // School fees are a child-earmarked cost (excluded from the declared obligations the read subtracts).
    const schoolFeesCents = commitments.filter((r) => r.key === "school_fees").reduce((s, r) => s + rowMonthlyCents(r), 0)
    const depA = intOrNull(dependentAdults)
    const depM = intOrNull(dependentMinors)
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/co-applicant/${token}/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName, idType: form.idType, idNumber: form.idNumber, dob: form.dob,
          maritalStatus: form.maritalStatus, matrimonialRegime: form.matrimonialRegime,
          currentAddress: form.addresses ?? null,
          spouseInfo: resolveSpouse(),
          employmentType: emp.employment_type, employerName: emp.employer,
          grossMonthlyIncomeCents: totalMonthlyCents(income),
          declaredMonthlyObligationsCents: totalMonthlyCents(commitments) - schoolFeesCents,
          sectionData: {
            addresses: form.addresses ?? null,
            marital: { maritalStatus: form.maritalStatus ?? null, matrimonialRegime: form.matrimonialRegime ?? null },
            employment_details: { ...emp },
            income_sources: incomeSourcesPayload(income),
            expenses: incomeSourcesPayload(commitments),
            dependants: { adults: depA, minors: depM, school_fees: posOrNull(schoolFeesCents / 100) },
          },
          consent: true,
        }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) { toast.error(json.error ?? "Could not save your details."); return }
      setDone(true)
    } catch {
      toast.error("Could not save your details. Please try again.")
    } finally { setBusy(false) }
  }

  return (
    <Shell>
      <div className="border-b border-[var(--rule)] pb-3">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--ink)]">Complete your part of the application</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">You&apos;ve been added to the application for <strong className="text-[var(--ink)]">{unitLabel}</strong> by {primaryName}. Confirm your details and consent below.</p>
      </div>

      {prefill.linkedAsSpouse && (
        <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--amber)] bg-[var(--amber-wash)] p-3 text-sm leading-relaxed text-[var(--ink-soft)]">
          <span className="mt-0.5 inline-block size-1.5 shrink-0 rounded-full bg-[var(--amber)]" />
          <span>{primaryName} indicated you&apos;re their spouse (married in community of property). We&apos;ve pre-filled that below — please confirm or correct it.</span>
        </div>
      )}

      <IndividualIdentity f={form} set={set} errors={errors} fullFica sectioned coApplicants={primaryCandidate ? [primaryCandidate] : []} suggestSpouseIsCo={false} />

      <StepAddress form={form} set={set} errors={errors} />

      <StepEmployment emp={emp} setEmp={setEmp} />
      <StepIncome income={income} setIncome={setIncome} variable={SELF_EMPLOYED_TYPES.includes(emp.employment_type) || emp.employment_type === "commission"} />
      <StepExpenses dependentAdults={dependentAdults} setDependentAdults={setDependentAdults} dependentMinors={dependentMinors} setDependentMinors={setDependentMinors} commitments={commitments} setCommitments={setCommitments} />

      <StepDocuments tab="required" categories={docCategories} docFiles={docFiles} escape={docEscape} onUpload={uploadDoc} onRemove={removeDoc} onRename={renameDoc} onEscape={(k, v) => setDocEscape((p) => ({ ...p, [k]: v }))} />

      <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-3.5 accent-[var(--amber)]" />
        <span>I confirm these are my details and I consent to the processing of my personal information for this rental application — affordability pre-screening and, if shortlisted, verification of my documents. No credit or bureau check runs at this stage.</span>
      </label>

      <div className="flex justify-end">
        <ActionButton tone="primary" onClick={submit} disabled={busy}>Submit my details</ActionButton>
      </div>
    </Shell>
  )
}
