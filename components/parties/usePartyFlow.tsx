"use client"

/**
 * components/parties/usePartyFlow.tsx — the host-agnostic "add/edit a party" brain
 *
 * Notes:  Owns entity/form/step/validation/submit state and exposes everything a host shell needs to render
 *         the wizard. Steps are data-driven (buildPartySteps per role/entity) so the flow is many focused
 *         side-steps rather than one long Details screen; each step validates only its own section, and the
 *         body for a step id comes from PartyStepBody. Runs standalone (its own WizardModal → SuccessView)
 *         or inline as a sub-flow (pass onDone). Edit mode pre-fills + relabels + locks the entity toggle.
 */
import { useState } from "react"
import type { WizardModalStep } from "@/components/ui/wizard-modal"
import { PARTY_ROLES, type PartyRole, type PartyEntity } from "@/lib/parties/partyConfig"
import {
  type PartyFormState, type PartyErrors, type AddPartyInput, type AddPartyResult, type PartyPerson, type PartyAddressInput,
} from "@/lib/parties/partyValidation"
import { buildPartySteps } from "@/lib/parties/partyStepPlan"
import { PartyStepBody } from "./partySteps"

type FlowMode = "add" | "edit"

function headingFor(stepId: string, label: string, isConfirm: boolean, mode: FlowMode, singular: string): string {
  if (stepId === "identity") return mode === "edit" ? `Edit ${singular.toLowerCase()}` : `Add a ${singular.toLowerCase()}`
  if (isConfirm) return mode === "edit" ? "Review changes" : "Review & confirm"
  return label
}

function subtitleFor(stepId: string, isConfirm: boolean, mode: FlowMode, blurb: string, singular: string): string | undefined {
  if (stepId === "identity") return mode === "edit" ? undefined : blurb
  if (isConfirm) return mode === "edit" ? "Check the changes before you save." : `Check everything before you add the ${singular.toLowerCase()}.`
  return undefined
}

function primaryLabelFor(isConfirm: boolean, submitting: boolean, mode: FlowMode, singular: string): string {
  // edit mode: save from any step (the rail lets you jump straight to the one you want)
  if (mode === "edit") return submitting ? "Saving…" : "Save changes"
  if (!isConfirm) return "Continue"
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
  /** Hide the landlord "welcome pack" prompt (the self "add me as landlord" path). */
  hideWelcomePack?: boolean
  /** "edit" pre-fills the form and switches the copy to save-changes; the entity toggle is locked. */
  mode?:          FlowMode
  initialEntity?: PartyEntity
  initialForm?:   PartyFormState
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

export function usePartyFlow({
  role, onSubmit, onDone, hideWelcomePack, mode = "add", initialEntity, initialForm,
}: UsePartyFlowOptions): PartyFlow {
  const cfg = PARTY_ROLES[role]
  const [entity, setEntity] = useState<PartyEntity>(initialEntity ?? "individual")
  const [f, setF] = useState<PartyFormState>(initialForm ?? {})
  const [errors, setErrors] = useState<PartyErrors>({})
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<AddPartyResult | null>(null)

  const hideWelcome = hideWelcomePack || mode === "edit"
  const stepDefs = buildPartySteps(role, entity, cfg, hideWelcome)
  const safeStep = Math.min(step, stepDefs.length - 1)
  const current = stepDefs[safeStep]
  const isConfirm = current.id === "confirm"

  const set = (k: keyof PartyFormState, v: string | string[] | boolean | PartyPerson[] | PartyAddressInput[]) => {
    setF((p) => ({ ...p, [k]: v }))
    // clear this field's error as soon as it's edited (so a "required" warning doesn't linger after fixing it)
    setErrors((e) => (e[k] === undefined ? e : { ...e, [k]: undefined }))
  }

  const prefill = (values: Partial<PartyFormState>) => setF((p) => ({ ...p, ...values }))

  function reset() {
    setEntity(initialEntity ?? "individual"); setF(initialForm ?? {}); setErrors({}); setStep(0); setDone(null)
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
    const e = current.validate ? current.validate(entity, f) : {}
    setErrors(e)
    if (Object.keys(e).length > 0) return
    // edit mode: the primary button saves from whatever step you're on; add mode advances, submitting on confirm
    if (mode === "edit" || isConfirm) void submit()
    else setStep(safeStep + 1)
  }

  function back() { if (safeStep > 0) setStep(safeStep - 1) }
  function goTo(index: number) { setStep(index); setErrors({}) }

  const body = (
    <PartyStepBody
      stepId={current.id}
      role={role} entity={entity} setEntity={changeEntity}
      f={f} set={set} errors={errors}
      fullFica={cfg.fullFica} companyPeople={cfg.companyPeople}
      lockEntity={mode === "edit"} hideWelcomePack={hideWelcome}
    />
  )

  // In edit mode every step is reachable (all pre-filled), so mark non-current steps done → the rail makes them clickable.
  const steps: ReadonlyArray<WizardModalStep> = stepDefs.map((s, i) => ({
    id: s.id, label: s.label, hint: "In progress", done: mode === "edit" && i !== safeStep,
  }))

  return {
    role, entity, f, step: safeStep, done,
    steps,
    eyebrow:         `${mode === "edit" ? "Edit" : "Add"} ${cfg.singular.toLowerCase()}`,
    title:           headingFor(current.id, current.label, isConfirm, mode, cfg.singular),
    subtitle:        subtitleFor(current.id, isConfirm, mode, cfg.blurb, cfg.singular),
    primaryLabel:    primaryLabelFor(isConfirm, submitting, mode, cfg.singular),
    primaryDisabled: submitting,
    body, next, back, goTo, reset, prefill,
  }
}
