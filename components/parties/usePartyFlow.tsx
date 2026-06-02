"use client"

/**
 * components/parties/usePartyFlow.tsx — the host-agnostic "add a party" brain
 *
 * Notes:  Owns the entity/form/step/validation/submit state for a landlord/tenant/supplier add and
 *         exposes everything a host shell needs to render it (steps, title, subtitle, body, primary
 *         label, next/back/goTo). Lifted out of AddPartyModal so the SAME flow can run either
 *         standalone (its own WizardModal → SuccessView) or inline as a sub-flow inside another
 *         modal (e.g. the property wizard's Owner step → save-and-return). Pass `onDone` to take over
 *         what happens after a successful create: omit it for the standalone success view, or provide
 *         it for a sub-flow that selects the new party and returns to its host. Copy/fields/validation
 *         live in lib/parties — this only orchestrates them.
 */
import { useState } from "react"
import type { WizardModalStep } from "@/components/ui/wizard-modal"
import { PARTY_ROLES, type PartyRole, type PartyEntity } from "@/lib/parties/partyConfig"
import {
  validateIdentity, validateDetails,
  type PartyFormState, type PartyErrors, type AddPartyInput, type AddPartyResult,
} from "@/lib/parties/partyValidation"
import { IdentityStep, DetailsStep, ReviewStep } from "./partySteps"

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

function primaryLabelFor(step: number, submitting: boolean, singular: string): string {
  if (step !== 2) return "Continue"
  return submitting ? "Adding…" : `Add ${singular.toLowerCase()}`
}

export interface UsePartyFlowOptions {
  role:     PartyRole
  onSubmit: (input: AddPartyInput) => Promise<AddPartyResult>
  /**
   * When provided, a successful create calls this instead of surfacing the standalone success view —
   * used by a sub-flow host to select the new party and return. Omit it for the standalone modal,
   * which then exposes `done` so the caller can render the SuccessView.
   */
  onDone?:  (result: AddPartyResult) => void
}

export interface PartyFlow {
  role:            PartyRole
  entity:          PartyEntity
  f:               PartyFormState
  step:            number
  /** non-null after a successful standalone create (onDone omitted) — drives the SuccessView. */
  done:            AddPartyResult | null
  steps:           ReadonlyArray<WizardModalStep>
  eyebrow:         string
  title:           string
  subtitle?:       string
  primaryLabel:    string
  primaryDisabled: boolean
  body:            React.ReactNode
  /** advance / validate-then-submit on the last step. */
  next:            () => void
  /** previous step; a no-op at step 0 (the host decides cancel/return there). */
  back:            () => void
  goTo:            (index: number) => void
  reset:           () => void
  /** merge values into the form (e.g. pre-fill from a profile) without leaving the current step. */
  prefill:         (values: Partial<PartyFormState>) => void
}

export function usePartyFlow({ role, onSubmit, onDone }: UsePartyFlowOptions): PartyFlow {
  const cfg = PARTY_ROLES[role]
  const [entity, setEntity] = useState<PartyEntity>("individual")
  const [f, setF] = useState<PartyFormState>({})
  const [errors, setErrors] = useState<PartyErrors>({})
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<AddPartyResult | null>(null)

  const set = (k: keyof PartyFormState, v: string | string[] | boolean) =>
    setF((p) => ({ ...p, [k]: v }))

  const prefill = (values: Partial<PartyFormState>) =>
    setF((p) => ({ ...p, ...values }))

  function reset() {
    setEntity("individual"); setF({}); setErrors({}); setStep(0); setDone(null)
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
    if (onDone) onDone(result)
    else setDone(result)
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

  function back() { if (step > 0) setStep(step - 1) }
  function goTo(index: number) { setStep(index); setErrors({}) }

  const body = (
    <>
      {step === 0 && (
        <IdentityStep role={role} entity={entity} setEntity={changeEntity} f={f} set={set} errors={errors} fullFica={cfg.fullFica} />
      )}
      {step === 1 && <DetailsStep role={role} f={f} set={set} errors={errors} />}
      {step === 2 && <ReviewStep role={role} entity={entity} f={f} />}
    </>
  )

  return {
    role, entity, f, step, done,
    steps:           STEPS,
    eyebrow:         `Add ${cfg.singular.toLowerCase()}`,
    title:           stepHeading(step, cfg.singular, cfg.detailsTitle),
    subtitle:        stepSubtitle(step, cfg.blurb, cfg.singular),
    primaryLabel:    primaryLabelFor(step, submitting, cfg.singular),
    primaryDisabled: submitting,
    body, next, back, goTo, reset, prefill,
  }
}
