"use client"

/**
 * components/parties/AddPartyModal.tsx — the one unified "add a party" modal (ADDENDUM_19/parties)
 *
 * Notes:  Stepped door flow (Identity → Details → Review → Success) on the shared ModalCard. Renders
 *         all three party types (landlord/tenant/supplier) from PARTY_ROLES; the actual create is
 *         injected via `onSubmit`, so the same modal serves the suppliers/landlords/tenants pages and
 *         the property wizard. DRY: copy, fields, validation and role behaviour live in lib/parties.
 */
import { useState } from "react"
import { ModalCard } from "@/components/ui/modal-card"
import {
  PARTY_ROLES, type PartyRole, type PartyEntity,
} from "@/lib/parties/partyConfig"
import {
  validateIdentity, validateDetails,
  type PartyFormState, type PartyErrors, type AddPartyInput, type AddPartyResult,
} from "@/lib/parties/partyValidation"
import { Stepper } from "./partyFields"
import { IdentityStep, DetailsStep, ReviewStep, SuccessView } from "./partySteps"

export type { AddPartyInput, AddPartyResult }

const STEP_LABELS = ["Identity", "Details", "Confirm"]

function stepHeading(step: number, singular: string, detailsTitle: string): string {
  if (step === 0) return `Add a ${singular.toLowerCase()}`
  if (step === 1) return detailsTitle
  return "Review & confirm"
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

  const headTitle = done ? "" : stepHeading(step, cfg.singular, cfg.detailsTitle)

  return (
    <ModalCard
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      eyebrow={done ? undefined : cfg.singular}
      title={headTitle}
      className="max-w-xl"
    >
      {done ? (
        <SuccessView
          role={role}
          entity={entity}
          f={f}
          displayName={done.name ?? ""}
          onClose={close}
          onAddAnother={reset}
          onPrimaryAction={onPrimaryAction ? () => { onPrimaryAction(done); close() } : undefined}
        />
      ) : (
        <div className="flex flex-col">
          {step === 0 && <p className="-mt-2 mb-1 text-sm text-muted-foreground">{cfg.blurb}</p>}
          <Stepper labels={STEP_LABELS} current={step} />

          <div className="mt-5 max-h-[58vh] overflow-y-auto pr-1">
            {step === 0 && (
              <IdentityStep role={role} entity={entity} setEntity={changeEntity} f={f} set={set} errors={errors} fullFica={cfg.fullFica} />
            )}
            {step === 1 && <DetailsStep role={role} f={f} set={set} errors={errors} />}
            {step === 2 && <ReviewStep role={role} entity={entity} f={f} />}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={() => (step === 0 ? close() : setStep(step - 1))}
              className="rounded-[var(--r-button)] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <button
              type="button"
              onClick={next}
              disabled={submitting}
              className="rounded-[var(--r-button)] bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {primaryLabel(step, submitting, cfg.singular)}
            </button>
          </div>
        </div>
      )}
    </ModalCard>
  )
}
