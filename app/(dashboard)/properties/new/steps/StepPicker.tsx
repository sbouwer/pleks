"use client"

import { useState } from "react"
import {
  Home, House, Building2, Building, MapPin,
  Briefcase, Warehouse, LayoutGrid, Layers, Network,
  Info, ChevronUp, Check,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ALL_SEGMENTS,
  getSegmentScenarios,
  type ScenarioMeta,
  type ScenarioSegment,
  type ScenarioType,
} from "@/lib/properties/scenarios"
import { getScenarioEducation } from "@/lib/properties/scenarioEducation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWizard, type ManagedMode } from "../WizardContext"
import { OptionRow } from "../OptionRow"

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Home, House, Building2,
  Buildings: Building,   // lucide has Building, not Buildings
  MapPin, Briefcase,
  Building, Warehouse, LayoutGrid, Layers, Network,
}

function ScenarioIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Building
  return <Icon className={cn("shrink-0", className)} />
}

// ── Ownership radio ───────────────────────────────────────────────────────────

interface OwnershipRadioProps {
  value:    ManagedMode
  onChange: (v: ManagedMode) => void
}

function OwnershipRadio({ value, onChange }: OwnershipRadioProps) {
  const options: Array<{ value: ManagedMode; label: string; sub: string }> = [
    { value: "self_owned",          label: "I own it",                    sub: "The property is in your name or your entity" },
    { value: "managed_for_owner",   label: "I manage it for someone else", sub: "You're the managing agent; someone else owns it" },
  ]
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground mb-2">
        How are you involved with this property?
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <OptionRow
            key={opt.value}
            selected={value === opt.value}
            onSelect={() => onChange(opt.value)}
            label={opt.label}
            sub={opt.sub}
          />
        ))}
      </div>
    </fieldset>
  )
}

// ── Segment selector ──────────────────────────────────────────────────────────

interface SegmentSelectorProps {
  active:   ScenarioSegment
  onChange: (seg: ScenarioSegment) => void
}

function SegmentSelector({ active, onChange }: SegmentSelectorProps) {
  return (
    <>
      {/* Desktop: inline tab buttons */}
      <div className="hidden sm:flex gap-1 border-b">
        {ALL_SEGMENTS.map((seg) => (
          <button
            key={seg.value}
            type="button"
            onClick={() => onChange(seg.value)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              active === seg.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
            )}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* Mobile: Radix-based dropdown for proper font inheritance */}
      <div className="sm:hidden">
        <label className="text-xs text-muted-foreground mb-1 block">Property type</label>
        <Select value={active} onValueChange={(v) => v && onChange(v as ScenarioSegment)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_SEGMENTS.map((seg) => (
              <SelectItem key={seg.value} value={seg.value}>{seg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}

// ── Unit count input ──────────────────────────────────────────────────────────

interface UnitCountInputProps {
  value:    number
  onChange: (n: number) => void
}

function UnitCountInput({ value, onChange }: UnitCountInputProps) {
  return (
    <div
      className="flex items-center gap-1 mt-2"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="text-xs text-muted-foreground whitespace-nowrap">How many?</label>
      <input
        type="number"
        min={1}
        max={200}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          if (!isNaN(n) && n >= 1) onChange(n)
        }}
        className="w-16 rounded border border-input bg-background px-2 py-1 text-xs text-center"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

// ── Scenario card ─────────────────────────────────────────────────────────────

interface ScenarioCardProps {
  scenario:      ScenarioMeta
  selected:      boolean
  onSelect:      () => void
  unitCount:     number
  onUnitChange:  (n: number) => void
  infoOpen:      boolean
  onToggleInfo:  () => void
}

function ScenarioCard({
  scenario, selected, onSelect,
  unitCount, onUnitChange,
  infoOpen, onToggleInfo,
}: ScenarioCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect() }}
      className={cn(
        "group rounded-lg border transition-colors cursor-pointer select-none",
        selected
          ? "border-primary bg-primary/[0.04]"
          : "border-border hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Icon */}
        <ScenarioIcon
          name={scenario.icon}
          className={cn(
            "w-5 h-5 shrink-0 transition-colors",
            selected ? "text-primary" : "text-muted-foreground group-hover:text-primary",
          )}
        />

        {/* Name + one-liner */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-tight truncate">{scenario.label}</p>
          <p className="text-xs text-muted-foreground truncate">{scenario.tagline}</p>
        </div>

        {/* Info toggle */}
        <button
          type="button"
          aria-label={infoOpen ? "Hide details" : "Show details"}
          onClick={(e) => { e.stopPropagation(); onToggleInfo() }}
          className={cn(
            "rounded-full p-1 transition-colors shrink-0",
            infoOpen
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-primary hover:bg-primary/10",
          )}
        >
          {infoOpen ? <ChevronUp className="w-4 h-4" /> : <Info className="w-4 h-4" />}
        </button>

        {/* Tick indicator */}
        <div
          className={cn(
            "flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30 group-hover:border-primary/50",
          )}
          aria-hidden
        >
          {selected && <Check className="w-3 h-3" strokeWidth={3} />}
        </div>
      </div>

      {/* Unit count input (counted scenarios only) */}
      {selected && scenario.unitCountMode === "counted" && (
        <div className="px-3 pb-3 pl-11 -mt-1">
          <UnitCountInput value={unitCount} onChange={onUnitChange} />
        </div>
      )}

      {/* Educational bullets (expanded) */}
      {infoOpen && (
        <ul className="px-3 pb-3 pl-11 space-y-1.5 border-t pt-3">
          {getScenarioEducation(scenario.code).map((bullet) => (
            <li key={bullet} className="text-xs text-muted-foreground flex gap-2 leading-relaxed">
              <span className="mt-1 shrink-0 text-primary">•</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── StepPicker ────────────────────────────────────────────────────────────────

export function StepPicker() {
  const { state, patch } = useWizard()

  const [activeSegment, setActiveSegment] = useState<ScenarioSegment>("residential")
  const [expandedInfo, setExpandedInfo]   = useState<ScenarioType | null>(null)

  const scenarios = getSegmentScenarios(activeSegment)

  function handleSegmentChange(seg: ScenarioSegment) {
    setActiveSegment(seg)
    setExpandedInfo(null)
    // Reset scenario pick if it belongs to a different segment
    if (state.scenarioType) {
      const currentMeta = scenarios.find((s) => s.code === state.scenarioType)
      if (!currentMeta || currentMeta.segment !== seg) {
        patch({ scenarioType: null })
      }
    }
  }

  function handleSelectScenario(meta: ScenarioMeta) {
    patch({
      scenarioType: meta.code,
      unitCount:    meta.unitCountMode === "counted" ? state.unitCount || meta.defaultUnitCount : meta.defaultUnitCount,
    })
  }

  function handleAdvancedSetup() {
    patch({ scenarioType: "other", mode: "advanced" })
  }

  return (
    <div className="space-y-7">
      <div>
        <h2 className="font-heading text-2xl mb-1">Let&apos;s set up your property</h2>
        <p className="text-muted-foreground text-sm">
          A couple of quick choices and we&apos;ll tailor the setup to match your scenario.
        </p>
      </div>

      <OwnershipRadio
        value={state.managedMode}
        onChange={(v) => patch({ managedMode: v })}
      />

      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground">Which best describes this property?</p>

        <SegmentSelector active={activeSegment} onChange={handleSegmentChange} />

        <div className="space-y-2 pt-1">
          {scenarios.map((meta) => (
            <ScenarioCard
              key={meta.code}
              scenario={meta}
              selected={state.scenarioType === meta.code}
              onSelect={() => handleSelectScenario(meta)}
              unitCount={state.unitCount}
              onUnitChange={(n) => patch({ unitCount: n })}
              infoOpen={expandedInfo === meta.code}
              onToggleInfo={() =>
                setExpandedInfo((prev) => (prev === meta.code ? null : meta.code))
              }
            />
          ))}
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleAdvancedSetup}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
        >
          Something else → advanced setup
        </button>
      </div>
    </div>
  )
}
