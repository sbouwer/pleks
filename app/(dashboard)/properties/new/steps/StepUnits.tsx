"use client"

import { useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { buildSkeletonUnits, type SkeletonUnit } from "@/lib/properties/skeletonUnits"
import { getScenario } from "@/lib/properties/scenarios"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWizard } from "../WizardContext"

// ── Helpers ───────────────────────────────────────────────────────────────────

type Segment = "residential" | "commercial" | "industrial" | "mixed"

function getSegment(scenarioType: string): Segment {
  if (["r1","r2","r3","r4","r5"].includes(scenarioType)) return "residential"
  if (scenarioType === "c3")                              return "industrial"
  if (["c1","c2","c4"].includes(scenarioType))            return "commercial"
  return "mixed"
}

function unitSegment(unit: SkeletonUnit): "residential" | "commercial" {
  return unit.unit_type?.startsWith("residential") ? "residential" : "commercial"
}

const FURNISHING_OPTIONS = [
  { value: "unfurnished",    label: "Unfurnished" },
  { value: "semi_furnished", label: "Semi-furnished" },
  { value: "furnished",      label: "Furnished" },
]

// ── Small inline input ─────────────────────────────────────────────────────────

interface NumInputProps {
  value:    number | null
  onChange: (v: number | null) => void
  min?:     number
  label:    string
  compact?: boolean
}

function NumInput({ value, onChange, min = 0, label, compact }: Readonly<NumInputProps>) {
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      value={value ?? ""}
      placeholder="—"
      onChange={(e) => {
        const n = e.target.value === "" ? null : Number(e.target.value)
        onChange(n)
      }}
      className={
        compact
          ? "w-14 rounded border border-input bg-background px-1.5 py-1 text-center text-xs"
          : "w-16 rounded border border-input bg-background px-2 py-1 text-center text-sm"
      }
    />
  )
}

// ── Per-unit row ───────────────────────────────────────────────────────────────

interface UnitRowProps {
  unit:       SkeletonUnit
  index:      number
  segment:    Segment
  canRemove:  boolean
  onPatch:    (patch: Partial<SkeletonUnit>) => void
  onRemove:   () => void
}

function UnitRow({ unit, index, segment, canRemove, onPatch, onRemove }: Readonly<UnitRowProps>) {
  const seg = segment === "mixed" ? unitSegment(unit) : segment

  return (
    <div className="grid items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
      style={{ gridTemplateColumns: "1fr auto" }}>

      {/* Name + fields */}
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {/* Index */}
        <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>

        {/* Unit name */}
        <input
          type="text"
          value={unit.unit_number}
          onChange={(e) => onPatch({ unit_number: e.target.value })}
          aria-label="Unit name"
          className="w-28 rounded border border-input bg-background px-2 py-1 text-sm font-medium"
          placeholder="Unit name"
        />

        {/* Residential fields */}
        {seg === "residential" && (
          <>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Beds
              <NumInput label="Bedrooms" value={unit.bedrooms} onChange={(v) => onPatch({ bedrooms: v })} compact />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Baths
              <NumInput label="Bathrooms" value={unit.bathrooms} onChange={(v) => onPatch({ bathrooms: v })} compact />
            </label>
            <Select
              value={unit.furnishing_status ?? "unfurnished"}
              onValueChange={(v) => onPatch({ furnishing_status: v as SkeletonUnit["furnishing_status"] })}
            >
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FURNISHING_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {/* Size — all types */}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          m²
          <NumInput label="Size m²" value={unit.size_m2} onChange={(v) => onPatch({ size_m2: v })} compact />
        </label>

        {/* Parking — residential + commercial */}
        {seg !== "industrial" && (
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Parking
            <NumInput label="Parking bays" value={unit.parking_bays} onChange={(v) => onPatch({ parking_bays: v })} compact />
          </label>
        )}

        {/* Industrial extras */}
        {seg === "industrial" && (
          <>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Roller doors
              <NumInput label="Roller doors" value={unit.roller_door_count} onChange={(v) => onPatch({ roller_door_count: v })} compact />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={unit.three_phase_power ?? false}
                onChange={(e) => onPatch({ three_phase_power: e.target.checked })}
                className="h-3.5 w-3.5 rounded"
              />
              3-phase
            </label>
          </>
        )}
      </div>

      {/* Remove button */}
      {canRemove && (
        <button
          type="button"
          aria-label={`Remove ${unit.unit_number}`}
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ── StepUnits ─────────────────────────────────────────────────────────────────

export function StepUnits() {
  const { state, patch } = useWizard()

  const scenario   = state.scenarioType ? getScenario(state.scenarioType) : null
  const isCounted  = scenario?.unitCountMode === "counted"
  const segment    = state.scenarioType ? getSegment(state.scenarioType) : "residential"

  // Seed unit drafts from skeleton on mount or when scenario / count changes
  useEffect(() => {
    if (!state.scenarioType) return
    // Re-seed only when count is off (picker changed unit count) or drafts are empty
    if (state.units.length === state.unitCount && state.units.length > 0) return

    const skeleton = buildSkeletonUnits({
      scenarioType:    state.scenarioType as Parameters<typeof buildSkeletonUnits>[0]["scenarioType"],
      propertyName:    state.address?.property_name ?? "Property",
      scenarioAnswers: state.scenarioAnswers,
      unitCount:       state.unitCount,
    })
    patch({ units: skeleton, unitCount: skeleton.length })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scenarioType, state.unitCount])

  function patchUnit(index: number, delta: Partial<SkeletonUnit>) {
    const next = state.units.map((u, i) => i === index ? { ...u, ...delta } : u)
    patch({ units: next })
  }

  function addUnit() {
    const n    = state.units.length + 1
    const stub = buildSkeletonUnits({
      scenarioType:    state.scenarioType as Parameters<typeof buildSkeletonUnits>[0]["scenarioType"],
      propertyName:    state.address?.property_name ?? "Property",
      scenarioAnswers: state.scenarioAnswers,
      unitCount:       1,
    })[0]
    const next = [...state.units, { ...stub, unit_number: `Unit ${n}` }]
    patch({ units: next, unitCount: next.length })
  }

  function removeUnit(index: number) {
    if (state.units.length <= 1) return
    const next = state.units.filter((_, i) => i !== index)
    patch({ units: next, unitCount: next.length })
  }

  if (!scenario) {
    return <p className="text-sm text-muted-foreground">Please select a property type first.</p>
  }

  return (
    <div className="space-y-4">
      {/* Column headers */}
      <div className="flex flex-wrap items-center gap-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        <span className="w-5" />
        <span className="w-28">Unit name</span>
        {segment === "residential" && <><span className="w-14">Beds</span><span className="w-14">Baths</span><span className="w-32">Furnishing</span></>}
        <span className="w-14">m²</span>
        {segment !== "industrial" && <span className="w-14">Parking</span>}
        {segment === "industrial" && <><span className="w-20">Roller doors</span><span className="w-16">3-phase</span></>}
      </div>

      <div className="space-y-1.5">
        {state.units.map((unit, i) => (
          <UnitRow
            key={i}
            unit={unit}
            index={i}
            segment={segment}
            canRemove={isCounted && state.units.length > 1}
            onPatch={(delta) => patchUnit(i, delta)}
            onRemove={() => removeUnit(i)}
          />
        ))}
      </div>

      {isCounted && (
        <Button variant="outline" size="sm" onClick={addUnit} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add unit
        </Button>
      )}
    </div>
  )
}
