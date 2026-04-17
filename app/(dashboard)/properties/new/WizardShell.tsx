"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useWizard, computeActiveStepIds, type WizardState } from "./WizardContext"
import { createPropertyFromWizard, type WizardSavePayload } from "@/lib/actions/createPropertyFromWizard"
import { PropertyForm } from "../PropertyForm"
import { createProperty } from "@/lib/actions/properties"
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

// ── Step label map ─────────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  picker:   "Property type",
  address:  "Address",
  universal: "Details",
  followup: "Specifics",
  hours:    "Hours",
  landlord: "Owner",
  units:    "Units",
  insurance: "Insurance",
  documents: "Documents",
  summary:  "Review",
}

// ── Step renderer ──────────────────────────────────────────────────────────────

function renderStep(stepId: string) {
  switch (stepId) {
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
    unitLabels:            state.unitLabels,
    insurance:             state.insurance,
  }
}

// ── Progress indicator ─────────────────────────────────────────────────────────

interface ProgressDotsProps {
  stepIds:      string[]
  currentIndex: number
}

function ProgressDots({ stepIds, currentIndex }: ProgressDotsProps) {
  return (
    <nav aria-label="Wizard progress" className="mb-8">
      <ol className="flex items-center gap-1 flex-wrap">
        {stepIds.map((id, i) => {
          const done    = i < currentIndex
          const active  = i === currentIndex
          const pending = i > currentIndex
          return (
            <li key={id} className="flex items-center gap-1">
              <span
                aria-current={active ? "step" : undefined}
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors",
                  done    && "bg-primary text-primary-foreground",
                  active  && "ring-2 ring-primary bg-primary/10 text-primary",
                  pending && "bg-muted text-muted-foreground",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={[
                  "hidden sm:inline text-xs",
                  active  && "font-medium text-foreground",
                  !active && "text-muted-foreground",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {STEP_LABELS[id] ?? id}
              </span>
              {i < stepIds.length - 1 && (
                <span className="mx-1 text-muted-foreground/40 text-xs select-none">›</span>
              )}
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

  // Picker step requires a scenario selection before continuing
  const canContinue = currentStepId !== "picker" || state.scenarioType !== null

  function handleSwitchToAdvanced() {
    patch({ mode: "advanced" })
  }

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
          <Button variant="ghost" size="sm" onClick={() => patch({ mode: "wizard" })}>
            ← Back to wizard
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Advanced setup uses the original property form below — no scenario, no pre-fills. Use this
          for edge cases that don&apos;t fit the guided wizard.
        </p>
        <PropertyForm action={createProperty} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <ProgressDots stepIds={stepIds} currentIndex={state.step} />

      <div className="min-h-64">
        {renderStep(currentStepId)}
      </div>

      {saveError && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {saveError}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        <div className="flex items-center gap-3">
          {!isFirst && !isSaving && (
            <Button variant="outline" onClick={goBack}>
              Back
            </Button>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            onClick={handleSwitchToAdvanced}
            disabled={isSaving}
          >
            Switch to advanced setup
          </button>
        </div>

        <Button onClick={handlePrimary} disabled={!canContinue || isSaving}>
          {primaryButtonLabel(isLast, isSaving)}
        </Button>
      </div>
    </div>
  )
}
