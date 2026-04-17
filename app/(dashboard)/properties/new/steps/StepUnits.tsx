"use client"

import { useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { buildSkeletonUnits } from "@/lib/properties/skeletonUnits"
import { getScenario } from "@/lib/properties/scenarios"
import { useWizard } from "../WizardContext"

// ── Default label derivation ──────────────────────────────────────────────────

function deriveDefaultLabels(
  scenarioType: string,
  propertyName: string,
  unitCount: number,
  scenarioAnswers: Record<string, unknown>,
): string[] {
  try {
    const units = buildSkeletonUnits({
      scenarioType: scenarioType as Parameters<typeof buildSkeletonUnits>[0]["scenarioType"],
      propertyName,
      scenarioAnswers,
      unitCount,
    })
    return units.map((u) => u.unit_number)
  } catch {
    return Array.from({ length: unitCount }, (_, i) => `Unit ${i + 1}`)
  }
}

// ── StepUnits ─────────────────────────────────────────────────────────────────

export function StepUnits() {
  const { state, patch } = useWizard()

  const scenario      = state.scenarioType ? getScenario(state.scenarioType) : null
  const isCounted     = scenario?.unitCountMode === "counted"
  const propertyName  = state.address?.property_name || "Property"

  // Initialise labels from skeleton on first mount or when count/scenario changes
  useEffect(() => {
    if (!state.scenarioType) return
    if (state.unitLabels.length === state.unitCount && state.unitLabels.length > 0) return

    const labels = deriveDefaultLabels(
      state.scenarioType,
      propertyName,
      state.unitCount,
      state.scenarioAnswers,
    )
    patch({ unitLabels: labels, unitCount: labels.length })
  // Intentionally omits state from deps — only re-runs if scenarioType or unitCount changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scenarioType, state.unitCount])

  function updateLabel(index: number, value: string) {
    const next = [...state.unitLabels]
    next[index] = value
    patch({ unitLabels: next })
  }

  function addUnit() {
    const next = [...state.unitLabels, `Unit ${state.unitLabels.length + 1}`]
    patch({ unitLabels: next, unitCount: next.length })
  }

  function removeUnit(index: number) {
    if (state.unitLabels.length <= 1) return
    const next = state.unitLabels.filter((_, i) => i !== index)
    patch({ unitLabels: next, unitCount: next.length })
  }

  if (!scenario) {
    return (
      <div className="space-y-2">
        <h2 className="font-heading text-2xl">Name your units</h2>
        <p className="text-muted-foreground text-sm">Please select a property type first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl mb-1">Name your units</h2>
        <p className="text-muted-foreground text-sm">
          {isCounted
            ? `We'll create ${state.unitLabels.length} unit(s) for this property. Edit the labels to match your naming.`
            : "These labels are pre-set for your property type. Edit them if you'd like different names."}
        </p>
      </div>

      <ol className="space-y-2">
        {state.unitLabels.map((label, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
            <input
              type="text"
              value={label}
              onChange={(e) => updateLabel(i, e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={`Unit ${i + 1}`}
            />
            {isCounted && state.unitLabels.length > 1 && (
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => removeUnit(i)}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ol>

      {isCounted && (
        <Button variant="outline" size="sm" onClick={addUnit} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add unit
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        Unit details (bedrooms, size, etc.) are added on the Units tab after the property is created.
      </p>
    </div>
  )
}
