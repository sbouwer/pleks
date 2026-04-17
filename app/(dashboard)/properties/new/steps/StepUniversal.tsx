"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { getScenario } from "@/lib/properties/scenarios"
import type { UniversalAnswers } from "@/lib/properties/buildProfile"
import { useWizard } from "../WizardContext"

// ── Shared radio-group primitive ──────────────────────────────────────────────

interface RadioOption {
  value: string
  label: string
  sub?:  string
}

interface RadioGroupProps {
  label:    string
  helpText?: string
  options:  RadioOption[]
  value:    string | null
  onChange: (v: string) => void
  required?: boolean
}

function RadioGroup({ label, helpText, options, value, onChange, required }: RadioGroupProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-destructive text-xs">*</span>}
      </legend>
      {helpText && <p className="text-xs text-muted-foreground -mt-1">{helpText}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "text-left rounded-lg border px-3 py-2.5 text-sm transition-colors",
              value === opt.value
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40",
            )}
          >
            <span className="block font-medium text-sm">{opt.label}</span>
            {opt.sub && <span className="block text-xs text-muted-foreground mt-0.5">{opt.sub}</span>}
          </button>
        ))}
      </div>
    </fieldset>
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

const SCHEME_OPTIONS: RadioOption[] = [
  { value: "no",             label: "No" },
  { value: "body_corporate", label: "Body corporate",          sub: "Sectional title scheme (STSMA)" },
  { value: "hoa",            label: "Homeowners association",   sub: "HOA" },
  { value: "share_block",    label: "Share block" },
  { value: "other_scheme",   label: "Other scheme" },
  { value: "not_sure",       label: "Not sure", sub: "Check with owner later" },
]

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
    backupPower:       local.backupPower ?? "none",
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

  // Sync to wizard context whenever local changes
  const syncToContext = useCallback(
    (next: LocalState) => {
      patch({ universals: localToAnswers(next) })
    },
    [patch],
  )

  function update(changes: Partial<LocalState>) {
    setLocal((prev) => {
      const next = { ...prev, ...changes }
      syncToContext(next)
      return next
    })
  }

  // Pre-populate context on mount if scenario has a preselected scheme
  useEffect(() => {
    if (schemePreselected && !state.universals) {
      syncToContext(local)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showSchemeName =
    local.schemeOption !== null &&
    local.schemeOption !== "no" &&
    local.schemeOption !== "not_sure"

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-2xl mb-1">A few quick questions</h2>
        <p className="text-muted-foreground text-sm">
          Applies to every property — helps us tailor leases, inspections, and maintenance.
        </p>
      </div>

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
        <div className="space-y-3">
          <RadioGroup
            label="Is this property part of a managing scheme?"
            options={SCHEME_OPTIONS}
            value={local.schemeOption}
            onChange={(v) => update({ schemeOption: v as SchemeOption })}
            required
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
      <RadioGroup
        label="Active WiFi or fibre connection at this property?"
        helpText="Connectivity is now treated as a utility — drives clause defaults in the lease wizard."
        options={[
          { value: "yes",     label: "Yes" },
          { value: "no",      label: "No" },
          { value: "unknown", label: "Unknown — check with owner" },
        ]}
        value={local.wifi}
        onChange={(v) => update({ wifi: v as UniversalAnswers["wifiAvailable"] })}
      />

      {/* Cell signal */}
      <RadioGroup
        label="Cell phone signal quality at the property"
        helpText="Poor signal triggers an offline-sync reminder before inspection visits."
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
      <RadioGroup
        label="Backup power setup"
        helpText="Determines utility clause defaults and insurance rider notes."
        options={[
          { value: "none",      label: "None" },
          { value: "ups",       label: "UPS",          sub: "Computer / internet only" },
          { value: "inverter",  label: "Inverter",     sub: "Lights and plugs" },
          { value: "solar",     label: "Solar",        sub: "Partial or full" },
          { value: "generator", label: "Generator" },
          { value: "multiple",  label: "Multiple",     sub: "Combination of the above" },
        ]}
        value={local.backupPower}
        onChange={(v) => update({ backupPower: v as UniversalAnswers["backupPower"] })}
      />
    </div>
  )
}
