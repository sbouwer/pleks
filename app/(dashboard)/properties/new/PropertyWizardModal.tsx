"use client"

/**
 * app/(dashboard)/properties/new/PropertyWizardModal.tsx — the property wizard as the universal modal
 *
 * Route:  opened over /properties (and at /properties/new); not a page itself
 * Auth:   the save path (createPropertyFromWizard) enforces requireAgentWriteAccess
 * Data:   WizardContext (in-memory + localStorage draft); createPropertyFromWizard on save
 * Notes:  Replaces the full-page WizardShell — the same owner-first flow, step computation and save
 *         handler, now hosted in the shared WizardModal (wide left-rail door). Controlled via open/
 *         onClose by a launcher; the single WizardModal stays mounted across steps so it never feels
 *         like you left the surface. The landlord sub-flow (Owner step → "add a landlord") swaps this
 *         same modal's contents in place — see PropertyWizardModalInner (B2). Advanced setup falls
 *         back to PropertyForm inside the same frame.
 */
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { WizardModal, type WizardModalStep } from "@/components/ui/wizard-modal"
import {
  WizardProvider, useWizard, computeActiveStepIds, clearWizardDraft, type WizardState,
} from "./WizardContext"
import { createPropertyFromWizard, type WizardSavePayload } from "@/lib/actions/createPropertyFromWizard"
import { createProperty } from "@/lib/actions/properties"
import { addLandlordParty } from "@/lib/actions/parties"
import { usePartyFlow } from "@/components/parties/usePartyFlow"
import { PropertyForm } from "../PropertyForm"
import { AddLandlordProvider } from "./addLandlordContext"
import { StepRelationship }     from "./steps/StepRelationship"
import { StepCheckDetails }     from "./steps/StepCheckDetails"
import { StepPicker }           from "./steps/StepPicker"
import { StepAddress }          from "./steps/StepAddress"
import { StepUniversal }        from "./steps/StepUniversal"
import { StepScenarioFollowUp } from "./steps/StepScenarioFollowUp"
import { StepOperatingHours }   from "./steps/StepOperatingHours"
import { StepLandlord }         from "./steps/StepLandlord"
import { StepUnits }            from "./steps/StepUnits"
import { StepInsurance }        from "./steps/StepInsurance"
import { StepDocuments }        from "./steps/StepDocuments"
import { StepSummary }          from "./steps/StepSummary"

// ── Step metadata ──────────────────────────────────────────────────────────────

interface StepMeta { label: string; title: string; subtitle: string }

const STEP_META: Record<string, StepMeta> = {
  relationship:   { label: "Who for?",     title: "Who is this property for?",        subtitle: "Tell us whose property this is — yours, or one you manage for someone else." },
  owner_details:  { label: "Your details", title: "Check your details",               subtitle: "A quick confirm of your role on this property." },
  agent_details:  { label: "Your details", title: "Check your details",               subtitle: "A quick confirm of your role on this property." },
  picker:    { label: "Property type", title: "Let's set up your property",       subtitle: "A couple of quick choices and we'll tailor the setup to your scenario." },
  universal: { label: "Details",       title: "A few quick questions",            subtitle: "Applies to this property — helps us tailor leases, inspections, and maintenance." },
  address:   { label: "Address",       title: "Where is the property?",           subtitle: "Used to pre-fill lease clauses, route municipal info, and label statements." },
  followup:  { label: "Specifics",     title: "A bit more about your property",   subtitle: "Scenario-specific details to round out the profile." },
  hours:     { label: "Hours",         title: "Operating hours",                  subtitle: "Sets access window defaults in lease clauses and inspection scheduling." },
  landlord:  { label: "Owner",         title: "Who owns this property?",          subtitle: "Link the owner now or add them after setup." },
  units:     { label: "Units",         title: "Units",                            subtitle: "Pre-filled from your earlier answers — adjust anything that differs." },
  insurance: { label: "Insurance",     title: "Insurance details",                subtitle: "Optional — you can always update this from the Insurance tab." },
  documents: { label: "Documents",     title: "Upload documents",                 subtitle: "Title deed, compliance certificates, and more — all optional. Add or update them anytime from the Documents tab." },
  summary:   { label: "Review",        title: "Review & save",                    subtitle: "Check everything before creating the property." },
}

// ── Step renderer ──────────────────────────────────────────────────────────────

function renderStep(stepId: string): React.ReactNode {
  switch (stepId) {
    case "relationship":  return <StepRelationship />
    case "owner_details": return <StepCheckDetails variant="owner" />
    case "agent_details": return <StepCheckDetails variant="agent" />
    case "picker":   return <StepPicker />
    case "address":  return <StepAddress />
    case "universal": return <StepUniversal />
    case "followup": return <StepScenarioFollowUp />
    case "hours":    return <StepOperatingHours />
    case "landlord": return <StepLandlord />
    case "units":    return <StepUnits />
    case "insurance": return <StepInsurance />
    case "documents": return <StepDocuments />
    case "summary":  return <StepSummary />
    default:         return null
  }
}

function primaryButtonLabel(isLast: boolean, isSaving: boolean): string {
  if (!isLast) return "Continue"
  return isSaving ? "Saving…" : "Save property"
}

// ── Wizard state → save payload (drops File objects) ──────────────────────────

function toSavePayload(state: WizardState): WizardSavePayload {
  return {
    scenarioType:          state.scenarioType!,   // validated server-side too
    managedMode:           state.managedMode,
    unitCount:             state.unitCount,
    address:               state.address,
    universals:            state.universals,
    scenarioAnswers:       state.scenarioAnswers,
    operatingHoursPreset:  state.operatingHoursPreset,
    afterHoursAccess:      state.afterHoursAccess,
    afterHoursNoticeHours: state.afterHoursNoticeHours,
    afterHoursNotes:       state.afterHoursNotes,
    landlord:              state.landlord,
    units:                 state.units,
    insurance:             state.insurance,
  }
}

// ── Per-step "can continue" gate (ADDENDUM_60C) ───────────────────────────────

function canContinue(state: WizardState, currentStepId: string): boolean {
  if (currentStepId === "relationship") return state.relationship !== null
  if (currentStepId === "owner_details" || currentStepId === "agent_details") return state.selfDetailsConfirmed
  if (currentStepId === "landlord") {
    const l = state.landlord
    if (!l?.option) return false
    if (l.option === "existing") return !!l.existing_id
    if (l.option === "new")      return !!(l.company_name?.trim() || l.first_name?.trim())
    return true   // "later" — deferring the owner is allowed
  }
  if (currentStepId === "picker") return state.scenarioType !== null
  if (currentStepId === "address") {
    const a = state.address
    return !!(a && a.street_name.trim() && a.city.trim() && a.province && a.property_name.trim())
  }
  return true
}

// ── Inner (inside WizardProvider) ─────────────────────────────────────────────

function PropertyWizardModalInner({ onClose }: Readonly<{ onClose: () => void }>) {
  const { state, patch, goNext, goBack } = useWizard()
  const router = useRouter()
  const [isSaving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Landlord sub-flow (Owner step → "add a landlord", in the same modal) ────
  const [subflow, setSubflow] = useState<"add_landlord" | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const landlordFlow = usePartyFlow({
    role: "landlord",
    onSubmit: addLandlordParty,
    onDone: (result) => {
      // created → select it as the owner and return to the property flow (no success interstitial)
      if (result.id) patch({ landlord: { option: "existing", existing_id: result.id } })
      setRefreshNonce((n) => n + 1)   // StepLandlord re-fetches and highlights the new owner
      setSubflow(null)
    },
  })
  function openAddLandlord() { landlordFlow.reset(); setSubflow("add_landlord") }

  const stepIds       = useMemo(() => computeActiveStepIds(state), [state])
  const currentStepId = stepIds[state.step] ?? "picker"
  const isFirst       = state.step === 0
  const isLast        = state.step === stepIds.length - 1
  const stepMeta      = STEP_META[currentStepId]

  function handlePrimary() {
    if (!isLast) { goNext(); return }
    setSaveError(null)
    startSaving(async () => {
      const formData = new FormData()
      formData.append("payload", JSON.stringify(toSavePayload(state)))
      formData.append("document_count", String(state.pendingDocuments.length))
      state.pendingDocuments.forEach((doc, i) => {
        formData.append(`document_${i}`,      doc.file)
        formData.append(`document_${i}_type`, doc.doc_type)
        if (doc.expires_at) formData.append(`document_${i}_expires`, doc.expires_at)
      })

      const result = await createPropertyFromWizard(formData)
      if (result.ok && result.propertyId) {
        clearWizardDraft()   // B12: created → discard the saved draft so the next run starts fresh
        router.push(`/properties/${result.propertyId}?tab=overview&first_visit=true`)
      } else {
        setSaveError(result.error ?? "Failed to save property")
      }
    })
  }

  // ── Landlord sub-flow: same modal, swapped contents ─────────────────────────
  if (subflow === "add_landlord") {
    return (
      <WizardModal
        open
        onOpenChange={(o) => { if (!o) setSubflow(null) }}   // close/Esc → back to property, never lose the wizard
        eyebrow={landlordFlow.eyebrow}
        steps={landlordFlow.steps}
        current={landlordFlow.step}
        onStepSelect={landlordFlow.goTo}
        title={landlordFlow.title}
        subtitle={landlordFlow.subtitle}
        backLabel={landlordFlow.step === 0 ? "Back to property" : "Back"}
        onBack={() => (landlordFlow.step === 0 ? setSubflow(null) : landlordFlow.back())}
        primaryLabel={landlordFlow.primaryLabel}
        onPrimary={landlordFlow.next}
        primaryDisabled={landlordFlow.primaryDisabled}
      >
        {landlordFlow.body}
      </WizardModal>
    )
  }

  // ── Advanced setup fallback (PropertyForm in the same frame) ────────────────
  if (state.mode === "advanced") {
    return (
      <WizardModal
        open
        onOpenChange={(o) => { if (!o) onClose() }}
        eyebrow="Add property"
        steps={[{ id: "advanced", label: "Advanced", hint: "In progress" }]}
        current={0}
        title="Advanced setup"
        subtitle="No scenario, no pre-fills — for edge cases that don't fit the guided wizard. Save from the form below."
        backLabel="Back to wizard"
        onBack={() => patch({ mode: "wizard" })}
        primaryLabel="Close"
        onPrimary={onClose}
      >
        <PropertyForm action={createProperty} />
      </WizardModal>
    )
  }

  const steps: WizardModalStep[] = stepIds.map((id) => ({
    id,
    label: STEP_META[id]?.label ?? id,
    hint:  "In progress",
  }))

  const advancedLink = currentStepId === "picker" ? (
    <button
      type="button"
      onClick={() => patch({ mode: "advanced" })}
      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      Something else → Advanced setup
    </button>
  ) : null

  return (
    <WizardModal
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      eyebrow="Add property"
      steps={steps}
      current={state.step}
      onStepSelect={(i) => { if (i < state.step) patch({ step: i }) }}
      title={stepMeta?.title ?? "Add property"}
      subtitle={stepMeta?.subtitle}
      backLabel={isFirst ? "Cancel" : "Back"}
      onBack={() => (isFirst ? onClose() : goBack())}
      primaryLabel={primaryButtonLabel(isLast, isSaving)}
      onPrimary={handlePrimary}
      primaryDisabled={!canContinue(state, currentStepId) || isSaving}
      footerError={saveError}
      footerSlot={advancedLink}
    >
      <AddLandlordProvider value={{ openAddLandlord, refreshNonce }}>
        {renderStep(currentStepId)}
      </AddLandlordProvider>
    </WizardModal>
  )
}

// ── Public: provider + inner ──────────────────────────────────────────────────

export function PropertyWizardModal({
  open, onClose,
}: Readonly<{ open: boolean; onClose: () => void }>) {
  if (!open) return null
  return (
    <WizardProvider>
      <PropertyWizardModalInner onClose={onClose} />
    </WizardProvider>
  )
}
