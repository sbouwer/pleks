"use client"

/**
 * app/(dashboard)/properties/new/WizardShell.tsx — Multi-step property creation wizard: step navigation, progress indicator, save handler
 *
 * Route:  /properties/new
 * Auth:   gateway-protected dashboard layout
 * Data:   createPropertyFromWizard server action; documents uploaded as FormData
 * Notes:  Fixed-height card with scrollable content + pinned footer; advanced mode falls back to PropertyForm
 */
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ActionButton, InlineLink } from "@/components/ui/actions"
import { cn } from "@/lib/utils"
import { useWizard, computeActiveStepIds, clearWizardDraft, type WizardState } from "./WizardContext"
import { createPropertyFromWizard, type WizardSavePayload } from "@/lib/actions/createPropertyFromWizard"
import { PropertyForm } from "../PropertyForm"
import { createProperty } from "@/lib/actions/properties"
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

const STEP_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(STEP_META).map(([k, v]) => [k, v.label]),
)

// ── Step renderer ──────────────────────────────────────────────────────────────

function renderStep(stepId: string) {
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

// ── Progress indicator ─────────────────────────────────────────────────────────

interface ProgressDotsProps {
  stepIds:      string[]
  currentIndex: number
}

function ProgressDots({ stepIds, currentIndex }: ProgressDotsProps) {
  const currentLabel = STEP_LABELS[stepIds[currentIndex] ?? ""] ?? ""
  const total        = stepIds.length
  const pct          = total === 1 ? 100 : Math.round((currentIndex / (total - 1)) * 100)

  return (
    <nav aria-label="Wizard progress" className="mb-4">
      {/* Text + bar for clarity across widths */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{currentLabel}</span>
        <span className="text-xs text-muted-foreground">Step {currentIndex + 1} of {total}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Dot row — condensed on mobile, labels appear on larger widths */}
      <ol className="flex items-center justify-between gap-1 mt-4 flex-wrap">
        {stepIds.map((id, i) => {
          const done    = i < currentIndex
          const active  = i === currentIndex
          const pending = i > currentIndex
          return (
            <li key={id} className="flex items-center gap-1.5 min-w-0">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium transition-colors",
                  done    && "bg-primary text-primary-foreground",
                  active  && "bg-primary/15 text-primary ring-2 ring-primary",
                  pending && "bg-muted text-muted-foreground/60",
                )}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "hidden md:inline text-[11px] truncate",
                  active  && "font-medium text-foreground",
                  !active && "text-muted-foreground",
                )}
              >
                {STEP_LABELS[id] ?? id}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ── Shell ──────────────────────────────────────────────────────────────────────

export function WizardShell() {
  const { state, goNext, goBack, patch } = useWizard()
  const router = useRouter()
  const [isSaving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  const stepIds       = useMemo(() => computeActiveStepIds(state), [state])
  const currentStepId = stepIds[state.step] ?? "picker"
  const isFirst       = state.step === 0
  const isLast        = state.step === stepIds.length - 1

  // Per-step "can continue" gates
  const canContinue = (() => {
    // ADDENDUM_60C step-1 gates
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
  })()

  function handlePrimary() {
    if (!isLast) {
      goNext()
      return
    }
    // Final step: save
    setSaveError(null)
    startSaving(async () => {
      const formData = new FormData()
      formData.append("payload", JSON.stringify(toSavePayload(state)))
      formData.append("document_count", String(state.pendingDocuments.length))
      state.pendingDocuments.forEach((doc, i) => {
        formData.append(`document_${i}`,         doc.file)
        formData.append(`document_${i}_type`,    doc.doc_type)
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

  if (state.mode === "advanced") {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <ActionButton tone="secondary" onClick={() => patch({ mode: "wizard" })}>
            ← Back to wizard
          </ActionButton>
        </div>
        <p className="text-muted-foreground text-sm">
          Advanced setup uses the original property form below — no scenario, no pre-fills. Use this
          for edge cases that don&apos;t fit the guided wizard.
        </p>
        <PropertyForm action={createProperty} />
      </div>
    )
  }

  const stepMeta = STEP_META[currentStepId]

  return (
    <div>
      {/* Dynamic page header with back link */}
      <div className="mb-3">
        <div className="mb-2">
          <InlineLink href="/properties">← Properties</InlineLink>
        </div>
        <h1 className="font-heading text-2xl font-bold leading-tight">{stepMeta?.title ?? "Add Property"}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{stepMeta?.subtitle ?? ""}</p>
      </div>

      <ProgressDots stepIds={stepIds} currentIndex={state.step} />

      {/* Fixed-height card: content scrolls, footer stays pinned */}
      <div className="rounded-2xl border bg-card shadow-sm flex flex-col h-[calc(100svh-13rem)] md:h-[550px] md:min-h-[550px] md:max-h-[550px]">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
          {renderStep(currentStepId)}
        </div>

        {/* Pinned footer */}
        <div className="shrink-0 border-t bg-card rounded-b-2xl">
          {saveError && (
            <div className="mx-5 mt-3 sm:mx-8 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {saveError}
            </div>
          )}
          <div className="flex items-center justify-between px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3">
              {!isFirst && !isSaving && (
                <ActionButton tone="secondary" onClick={goBack}>
                  Back
                </ActionButton>
              )}
              {currentStepId === "picker" && (
                <button
                  type="button"
                  onClick={() => patch({ mode: "advanced" })}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Something else → Advanced setup
                </button>
              )}
            </div>
            <ActionButton tone="primary" onClick={handlePrimary} disabled={!canContinue || isSaving}>
              {primaryButtonLabel(isLast, isSaving)}
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  )
}
