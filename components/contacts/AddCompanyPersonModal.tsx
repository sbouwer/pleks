"use client"

/**
 * components/contacts/AddCompanyPersonModal.tsx — "add a person" under a company contact
 *
 * Auth:   mutation via addCompanyPerson (agent write gate)
 * Data:   writes one contact under organisation_contact_id; refreshes the host on success
 * Notes:  Same shell + fields as the add-party wizard's People step (shared WizardModal + door-form
 *         underline inputs), so a company person is captured identically to a tenant/landlord person —
 *         except ID is OPTIONAL here (only a signatory triggers the server's FICA-ID requirement, and
 *         most company people aren't signatories). Side rail: Person details → Confirm. One person per open.
 */
import { useState, useTransition } from "react"
import { Field, UnderlineInput, UnderlineSelect } from "@/components/ui/door-form"
import { WizardModal, type WizardModalStep } from "@/components/ui/wizard-modal"
import { COMPANY_FUNCTION_OPTIONS, PARTY_ID_TYPES } from "@/lib/parties/partyConfig"
import { COMPANY_FUNCTION_LABEL } from "@/lib/contacts/contactScope"
import { validateSAId } from "@/lib/parties/partyValidation"
import { addCompanyPerson } from "@/lib/actions/companyContacts"

interface Draft {
  firstName: string; lastName: string; companyFunction: string; designation: string
  email: string; phone: string; isPrimary: boolean; isSignatory: boolean; idType: string; idNumber: string
}
const EMPTY: Draft = {
  firstName: "", lastName: "", companyFunction: "", designation: "",
  email: "", phone: "", isPrimary: false, isSignatory: false, idType: "sa_id", idNumber: "",
}

const FUNCTION_OPTIONS = [{ value: "", label: "Select…" }, ...COMPANY_FUNCTION_OPTIONS]
const ID_TYPE_OPTIONS = PARTY_ID_TYPES.map((t) => ({ value: t.value, label: t.label }))
const STEPS: WizardModalStep[] = [
  { id: "details", label: "Person details", hint: "In progress" },
  { id: "confirm", label: "Confirm", hint: "In progress" },
]

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 pb-2">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

export function AddCompanyPersonModal({
  open, onOpenChange, companyContactId, fica, onCreated,
}: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  companyContactId: string
  fica: boolean
  onCreated?: () => void
}>) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((d) => ({ ...d, [k]: v })); setError(null) }

  function close() {
    onOpenChange(false)
    // reset after the close animation so the next open starts fresh
    setTimeout(() => { setDraft(EMPTY); setStep(0); setError(null) }, 200)
  }

  function detailsError(): string | null {
    if (!draft.firstName.trim() && !draft.lastName.trim()) return "Enter at least a first or last name."
    if (!draft.companyFunction) return "Pick what this person does."
    return null
  }

  function next() {
    setError(null)
    if (step === 0) {
      const e = detailsError()
      if (e) { setError(e); return }
      setStep(1)
      return
    }
    startTransition(async () => {
      const res = await addCompanyPerson({ companyContactId, ...draft })
      if (!res.ok) { setError(res.error ?? "Failed to add the person."); return }
      onCreated?.()
      close()
    })
  }

  const isSaId = (draft.idType || "sa_id") === "sa_id"
  const idCheck = draft.isSignatory && isSaId && draft.idNumber.trim() ? validateSAId(draft.idNumber) : null
  const isConfirm = step === 1
  const addLabel = pending ? "Adding…" : "Add person"
  const primaryLabel = isConfirm ? addLabel : "Continue"
  const fullName = [draft.firstName, draft.lastName].filter(Boolean).join(" ").trim() || "This person"
  const functionLabel = draft.companyFunction ? COMPANY_FUNCTION_LABEL[draft.companyFunction] ?? draft.companyFunction : "—"

  const detailsBody = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="First name" required><UnderlineInput value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Jane" /></Field>
        <Field label="Last name" required><UnderlineInput value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Smith" /></Field>
        <Field label="Function" required><UnderlineSelect value={draft.companyFunction} onChange={(v) => set("companyFunction", v)} options={FUNCTION_OPTIONS} /></Field>
        <Field label="Role / title"><UnderlineInput value={draft.designation} onChange={(e) => set("designation", e.target.value)} placeholder="e.g. Accounting & Account Mgmt" /></Field>
        <Field label="Email"><UnderlineInput type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@company.co.za" /></Field>
        <Field label="Phone"><UnderlineInput type="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="082 000 0000" /></Field>
      </div>

      <label className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground">
        <input type="checkbox" checked={draft.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} className="accent-primary" />
        <span>Primary contact</span>
      </label>

      {fica && (
        <div className="border-t border-border/60 pt-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground">
            <input type="checkbox" checked={draft.isSignatory} onChange={(e) => set("isSignatory", e.target.checked)} className="accent-primary" />
            <span>Signatory — signs for the company (FICA)</span>
          </label>
          {draft.isSignatory && (
            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <Field label="ID type"><UnderlineSelect value={draft.idType} onChange={(v) => set("idType", v)} options={ID_TYPE_OPTIONS} /></Field>
              <Field label="ID number">
                <UnderlineInput value={draft.idNumber} onChange={(e) => set("idNumber", e.target.value)} placeholder={isSaId ? "13-digit SA ID" : "Passport / permit number"} />
                {idCheck && (
                  <span className={`mt-1 block text-xs ${idCheck.valid ? "text-emerald-600" : "text-destructive"}`}>
                    {idCheck.valid ? `Valid · ${idCheck.gender} · ${idCheck.citizenship}` : "Checksum doesn't validate"}
                  </span>
                )}
              </Field>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const confirmBody = (
    <dl className="space-y-3">
      <Row label="Name" value={fullName} />
      <Row label="Function" value={functionLabel} />
      {draft.designation.trim() && <Row label="Role / title" value={draft.designation} />}
      {draft.email.trim() && <Row label="Email" value={draft.email} />}
      {draft.phone.trim() && <Row label="Phone" value={draft.phone} />}
      <Row label="Primary contact" value={draft.isPrimary ? "Yes" : "No"} />
      {fica && <Row label="Signatory" value={draft.isSignatory ? "Yes" : "No"} />}
      {draft.isSignatory && draft.idNumber.trim() && <Row label="ID number" value={draft.idNumber} />}
    </dl>
  )

  return (
    <WizardModal
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      eyebrow="Add person"
      steps={STEPS}
      current={step}
      onStepSelect={(i) => { if (i < step) setStep(i) }}
      title={isConfirm ? "Review & confirm" : "Add a person"}
      subtitle={isConfirm ? "Check the details before you add them." : "Add someone who works under this company."}
      backLabel={step === 0 ? "Cancel" : "Back"}
      onBack={() => (step === 0 ? close() : setStep(step - 1))}
      primaryLabel={primaryLabel}
      onPrimary={next}
      primaryDisabled={pending}
      footerError={error}
    >
      {isConfirm ? confirmBody : detailsBody}
    </WizardModal>
  )
}
