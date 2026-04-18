"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { getScenario } from "@/lib/properties/scenarios"
import type { UniversalAnswers } from "@/lib/properties/buildProfile"
import { useWizard } from "../WizardContext"

// ── Inline segmented picker (single row) ──────────────────────────────────────

interface SegOption { value: string; label: string }

interface InlineSegmentProps {
  label:    string
  options:  SegOption[]
  value:    string | null
  onChange: (v: string) => void
}

function InlineSegment({ label, options, value, onChange }: Readonly<InlineSegmentProps>) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm font-medium text-right leading-none">{label}</span>
      <div className="flex rounded-md border border-border overflow-hidden">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              i > 0 && "border-l border-border",
              value === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}


// ── Scheme section ────────────────────────────────────────────────────────────

type SchemeOption =
  | "no"
  | "body_corporate"
  | "hoa"
  | "share_block"
  | "other_scheme"
  | "not_sure"


function schemeOptionToAnswers(opt: SchemeOption): Pick<UniversalAnswers, "hasManagingScheme" | "schemeType"> {
  if (opt === "no" || opt === "not_sure") {
    return { hasManagingScheme: false, schemeType: null }
  }
  return { hasManagingScheme: true, schemeType: opt }
}

function answersToSchemeOption(universals: UniversalAnswers): SchemeOption {
  if (!universals.hasManagingScheme) return "no"
  return (universals.schemeType as SchemeOption) ?? "other_scheme"
}

// ── Local state type ──────────────────────────────────────────────────────────

interface LocalState {
  schemeOption: SchemeOption | null
  schemeName:   string
  wifi:         UniversalAnswers["wifiAvailable"] | null
  cellSignal:   UniversalAnswers["cellSignalQuality"] | null
  backupPower:  UniversalAnswers["backupPower"] | null
}

function localToAnswers(local: LocalState): UniversalAnswers {
  const schemeAnswers = local.schemeOption
    ? schemeOptionToAnswers(local.schemeOption)
    : { hasManagingScheme: false, schemeType: null }

  return {
    wifiAvailable:     local.wifi     ?? "unknown",
    cellSignalQuality: local.cellSignal ?? "unknown",
    backupPower:       local.backupPower ?? "unknown",
    hasManagingScheme: schemeAnswers.hasManagingScheme,
    schemeType:        schemeAnswers.schemeType,
    schemeName:        local.schemeName || null,
  }
}

// ── StepUniversal ─────────────────────────────────────────────────────────────

export function StepUniversal() {
  const { state, patch } = useWizard()

  const scenario            = state.scenarioType ? getScenario(state.scenarioType) : null
  const preselectedScheme   = scenario?.preselectSchemeType ?? null
  const schemePreselected   = preselectedScheme !== null

  // Derive initial local state from existing universals (or scenario defaults)
  const [local, setLocal] = useState<LocalState>(() => {
    if (state.universals) {
      return {
        schemeOption: schemePreselected
          ? (preselectedScheme as SchemeOption)
          : answersToSchemeOption(state.universals),
        schemeName:  state.universals.schemeName ?? "",
        wifi:        state.universals.wifiAvailable,
        cellSignal:  state.universals.cellSignalQuality,
        backupPower: state.universals.backupPower,
      }
    }
    return {
      schemeOption: schemePreselected ? (preselectedScheme as SchemeOption) : null,
      schemeName:   "",
      wifi:         null,
      cellSignal:   null,
      backupPower:  null,
    }
  })

  // Sync local → context after every local change (never during render)
  useEffect(() => {
    patch({ universals: localToAnswers(local) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  function update(changes: Partial<LocalState>) {
    setLocal((prev) => ({ ...prev, ...changes }))
  }

  const showSchemeName =
    local.schemeOption !== null &&
    local.schemeOption !== "no" &&
    local.schemeOption !== "not_sure"

  return (
    <div className="space-y-6">

      {/* BC / scheme */}
      {schemePreselected ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span className="font-medium">Managing scheme: </span>
          <span className="text-muted-foreground">
            {preselectedScheme === "body_corporate"
              ? "Body corporate (pre-selected for sectional title)"
              : "Homeowners association (pre-selected for estate)"}
          </span>
          <div className="mt-2">
            <label htmlFor="scheme-name-preselected" className="text-xs text-muted-foreground block mb-1">
              Scheme name <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="scheme-name-preselected"
              type="text"
              value={local.schemeName}
              onChange={(e) => update({ schemeName: e.target.value })}
              placeholder={
                preselectedScheme === "body_corporate"
                  ? "e.g. Vineyard Heights Body Corporate"
                  : "e.g. Blue Ridge Estate HOA"
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <InlineSegment
            label="Managing scheme?"
            options={[
              { value: "no",             label: "No" },
              { value: "body_corporate", label: "Body corp" },
              { value: "hoa",            label: "HOA" },
              { value: "share_block",    label: "Share block" },
              { value: "other_scheme",   label: "Other" },
              { value: "not_sure",       label: "Not sure" },
            ]}
            value={local.schemeOption}
            onChange={(v) => update({ schemeOption: v as SchemeOption })}
          />
          {showSchemeName && (
            <div>
              <label htmlFor="scheme-name" className="text-xs font-medium block mb-1">
                Scheme name <span className="text-destructive">*</span>
              </label>
              <input
                id="scheme-name"
                type="text"
                value={local.schemeName}
                onChange={(e) => update({ schemeName: e.target.value })}
                placeholder="e.g. Vineyard Heights Body Corporate"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* WiFi / fibre */}
      <InlineSegment
        label="Active WiFi / fibre?"
        options={[
          { value: "yes",     label: "Yes" },
          { value: "no",      label: "No" },
          { value: "unknown", label: "Unknown" },
        ]}
        value={local.wifi}
        onChange={(v) => update({ wifi: v as UniversalAnswers["wifiAvailable"] })}
      />

      {/* Cell signal */}
      <InlineSegment
        label="Cell signal"
        options={[
          { value: "good",    label: "Good" },
          { value: "patchy",  label: "Patchy" },
          { value: "none",    label: "None" },
          { value: "unknown", label: "Unknown" },
        ]}
        value={local.cellSignal}
        onChange={(v) => update({ cellSignal: v as UniversalAnswers["cellSignalQuality"] })}
      />

      {/* Backup power */}
      <InlineSegment
        label="Backup power"
        options={[
          { value: "none",      label: "None" },
          { value: "ups",       label: "UPS" },
          { value: "inverter",  label: "Inverter" },
          { value: "solar",     label: "Solar" },
          { value: "generator", label: "Generator" },
          { value: "multiple",  label: "Multiple" },
          { value: "unknown",   label: "Unknown" },
        ]}
        value={local.backupPower}
        onChange={(v) => update({ backupPower: v as UniversalAnswers["backupPower"] })}
      />
    </div>
  )
}
