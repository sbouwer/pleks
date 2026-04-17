"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { useWizard, computeActiveStepIds } from "./WizardContext"
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

  const stepIds       = useMemo(() => computeActiveStepIds(state), [state])
  const currentStepId = stepIds[state.step] ?? "picker"
  const isFirst       = state.step === 0
  const isLast        = state.step === stepIds.length - 1

  // Picker step requires a scenario selection before continuing
  const canContinue = currentStepId !== "picker" || state.scenarioType !== null

  function handleSwitchToAdvanced() {
    patch({ mode: "advanced" })
  }

  if (state.mode === "advanced") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => patch({ mode: "wizard" })}>
            ← Back to wizard
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">Advanced setup coming in a later phase.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <ProgressDots stepIds={stepIds} currentIndex={state.step} />

      <div className="min-h-64">
        {renderStep(currentStepId)}
      </div>

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        <div className="flex items-center gap-3">
          {!isFirst && (
            <Button variant="outline" onClick={goBack}>
              Back
            </Button>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={handleSwitchToAdvanced}
          >
            Switch to advanced setup
          </button>
        </div>

        {!isLast ? (
          <Button onClick={goNext} disabled={!canContinue}>
            Continue
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canContinue}>
            Save property
          </Button>
        )}
      </div>
    </div>
  )
}
