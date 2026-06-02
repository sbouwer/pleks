"use client"

/**
 * components/parties/AddPartyModal.tsx — the one unified "add a party" modal (ADDENDUM_19/parties)
 *
 * Notes:  Stepped flow (Identity → Details → Confirm → Success) rendered on the shared WizardModal
 *         (the universal wide left-rail door used everywhere). Renders all three party types
 *         (landlord/tenant/supplier) from PARTY_ROLES; the actual create is injected via `onSubmit`,
 *         so the same modal serves the suppliers/landlords/tenants pages and the property wizard.
 *         DRY: copy, fields, validation and role behaviour live in lib/parties.
 */
import { useState } from "react"
import { WizardModal, type WizardModalStep } from "@/components/ui/wizard-modal"
import {
  PARTY_ROLES, type PartyRole, type PartyEntity,
} from "@/lib/parties/partyConfig"
import {
  validateIdentity, validateDetails,
  type PartyFormState, type PartyErrors, type AddPartyInput, type AddPartyResult,
} from "@/lib/parties/partyValidation"
import { IdentityStep, DetailsStep, ReviewStep, SuccessView } from "./partySteps"

export type { AddPartyInput, AddPartyResult }

const STEPS: ReadonlyArray<WizardModalStep> = [
  { id: "identity", label: "Identity", hint: "In progress" },
  { id: "details",  label: "Details",  hint: "In progress" },
  { id: "confirm",  label: "Confirm",  hint: "In progress" },
]

function stepHeading(step: number, singular: string, detailsTitle: string): string {
  if (step === 0) return `Add a ${singular.toLowerCase()}`
  if (step === 1) return detailsTitle
  return "Review & confirm"
}

function stepSubtitle(step: number, blurb: string, singular: string): string | undefined {
  if (step === 0) return blurb
  if (step === 2) return `Check everything before you add the ${singular.toLowerCase()}.`
  return undefined
}

function primaryLabel(step: number, submitting: boolean, singular: string): string {
  if (step !== 2) return "Continue"
  return submitting ? "Adding…" : `Add ${singular.toLowerCase()}`
}

export function AddPartyModal({
  role, open, onOpenChange, onSubmit, onCreated, onPrimaryAction,
}: Readonly<{
  role: PartyRole
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: AddPartyInput) => Promise<AddPartyResult>
  /** called after a successful create so the parent can refresh its list */
  onCreated?: () => void
  /** the success-view primary action (e.g. landlord → generate welcome pack); closes after */
  onPrimaryAction?: (result: AddPartyResult) => void
}>) {
  const cfg = PARTY_ROLES[role]
  const [entity, setEntity] = useState<PartyEntity>("individual")
  const [f, setF] = useState<PartyFormState>({})
  const [errors, setErrors] = useState<PartyErrors>({})
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<AddPartyResult | null>(null)

  const set = (k: keyof PartyFormState, v: string | string[] | boolean) =>
    setF((p) => ({ ...p, [k]: v }))

  function reset() {
    setEntity("individual"); setF({}); setErrors({}); setStep(0); setDone(null)
  }

  function close() {
    onOpenChange(false)
    // defer the reset so the close animation doesn't flash an empty step-0
    setTimeout(reset, 200)
  }

  function changeEntity(v: PartyEntity) { setEntity(v); setErrors({}) }

  async function submit() {
    setSubmitting(true)
    const result = await onSubmit({ role, entity, form: f })
    setSubmitting(false)
    if (!result.ok) {
      setErrors((p) => ({ ...p, ...(result.error ? { firstName: result.error } : {}) }))
      return
    }
    onCreated?.()
    setDone(result)
  }

  function next() {
    if (step === 0) {
      const e = validateIdentity(entity, f, cfg.fullFica)
      setErrors(e)
      if (Object.keys(e).length === 0) setStep(1)
    } else if (step === 1) {
      const e = validateDetails(role, f)
      setErrors(e)
      if (Object.keys(e).length === 0) setStep(2)
    } else {
      void submit()
    }
  }

  return (
    <WizardModal
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      eyebrow={`Add ${cfg.singular.toLowerCase()}`}
      steps={STEPS}
      current={step}
      onStepSelect={(i) => { setStep(i); setErrors({}) }}
      title={stepHeading(step, cfg.singular, cfg.detailsTitle)}
      subtitle={stepSubtitle(step, cfg.blurb, cfg.singular)}
      backLabel={step === 0 ? "Cancel" : "Back"}
      onBack={() => (step === 0 ? close() : setStep(step - 1))}
      primaryLabel={primaryLabel(step, submitting, cfg.singular)}
      onPrimary={next}
      primaryDisabled={submitting}
      success={done ? (
        <SuccessView
          role={role}
          entity={entity}
          f={f}
          displayName={done.name ?? ""}
          onClose={close}
          onAddAnother={reset}
          onPrimaryAction={onPrimaryAction ? () => { onPrimaryAction(done); close() } : undefined}
        />
      ) : undefined}
    >
      {step === 0 && (
        <IdentityStep role={role} entity={entity} setEntity={changeEntity} f={f} set={set} errors={errors} fullFica={cfg.fullFica} />
      )}
      {step === 1 && <DetailsStep role={role} f={f} set={set} errors={errors} />}
      {step === 2 && <ReviewStep role={role} entity={entity} f={f} />}
    </WizardModal>
  )
}
