"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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
    <nav aria-label="Wizard progress" className="mb-8">
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
    <div>
      <ProgressDots stepIds={stepIds} currentIndex={state.step} />

      {/* Fixed-height card: content scrolls, footer stays pinned */}
      <div className="rounded-2xl border bg-card shadow-sm flex flex-col" style={{ height: "calc(100vh - 280px)", minHeight: "520px", maxHeight: "680px" }}>
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
            <div>
              {!isFirst && !isSaving && (
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
              )}
            </div>
            <Button onClick={handlePrimary} disabled={!canContinue || isSaving} size="lg">
              {primaryButtonLabel(isLast, isSaving)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
