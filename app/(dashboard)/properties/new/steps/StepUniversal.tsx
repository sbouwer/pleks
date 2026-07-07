"use client"

/**
 * app/(dashboard)/properties/new/steps/StepUniversal.tsx — New-property wizard step: managing scheme, unit hints, and utilities (WiFi/signal/backup power)
 *
 * Notes:  bedroom pick encodes both unit type and count; some scheme types are pre-selected from the scenario
 */

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { getScenario } from "@/lib/properties/scenarios"
import type { UniversalAnswers } from "@/lib/properties/buildProfile"
import type { WizardState } from "../WizardContext"
import { useWizard } from "../WizardContext"
import { useTier } from "@/hooks/useTier"
import { WInput } from "./fields"

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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-36 shrink-0 text-right text-[11px] font-medium uppercase leading-tight tracking-[0.08em] text-muted-foreground">{label}</span>
      <div className="inline-flex flex-wrap gap-1 rounded-[var(--r-button)] border border-border bg-muted/40 p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
              value === opt.value
                ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}


// Inline label + child row — same rhythm as InlineSegment (w-36 uppercase label, content right).
function InlineRow({ label, required, htmlFor, children }: Readonly<{ label: string; required?: boolean; htmlFor?: string; children: React.ReactNode }>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={htmlFor} className="w-36 shrink-0 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}{required && <span className="text-primary"> *</span>}
      </label>
      <div className="min-w-[10rem] flex-1">{children}</div>
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

type UnitHints = WizardState["unitHints"]
type FurnishingVal = "unfurnished" | "semi_furnished" | "furnished"

interface LocalState {
  schemeOption:  SchemeOption | null
  schemeName:    string
  wifi:          UniversalAnswers["wifiAvailable"] | null
  cellSignal:    UniversalAnswers["cellSignalQuality"] | null
  backupPower:   UniversalAnswers["backupPower"] | null
  // Unit hints — bedroomPick encodes both unit type and count
  bedroomPick:   string | null   // "0","1","2","3","other","mixed"
  bedroomsOther: number | null   // only used when bedroomPick === "other"
  furnishing:    FurnishingVal | null
  bathrooms:     number | null
  sizeM2:        number | null
}

// Bedroom pick ↔ unitType / bedrooms conversion
function pickToUnitType(pick: string | null): string | null {
  if (pick === "0")     return "residential_studio"
  if (pick === "1")     return "residential_1bed"
  if (pick === "2")     return "residential_2bed"
  if (pick === "3")     return "residential_3bed"
  if (pick !== null)    return "residential_unknown"
  return null
}

function pickToBedrooms(pick: string | null, otherCount: number | null): number | null {
  if (pick === null || pick === "mixed") return null
  if (pick === "other") return otherCount
  return Number(pick)
}

function hintsToBedroomPick(unitType: string | null, bedrooms: number | null): string | null {
  if (unitType === "residential_studio") return "0"
  if (unitType === "residential_1bed")   return "1"
  if (unitType === "residential_2bed")   return "2"
  if (unitType === "residential_3bed")   return "3"
  if (unitType === "residential_unknown" && bedrooms === null) return "mixed"
  if (bedrooms !== null) return bedrooms <= 3 ? String(bedrooms) : "other"
  return null
}

function getBedroomOptions(scenarioType: string | null) {
  if (scenarioType === "r1") {
    // Flatlet/cottage — small, rarely 3+
    return [
      { value: "0",     label: "Studio" },
      { value: "1",     label: "1" },
      { value: "2",     label: "2" },
      { value: "other", label: "Other" },
    ]
  }
  if (scenarioType === "r2") {
    // Rental house — full house, no studio
    return [
      { value: "1",     label: "1" },
      { value: "2",     label: "2" },
      { value: "3",     label: "3" },
      { value: "4",     label: "4" },
      { value: "other", label: "5+" },
    ]
  }
  if (scenarioType === "r3") {
    // Sectional title apartment
    return [
      { value: "0",     label: "Studio" },
      { value: "1",     label: "1" },
      { value: "2",     label: "2" },
      { value: "3",     label: "3" },
      { value: "other", label: "Other" },
    ]
  }
  if (scenarioType === "r6") {
    // Student rooms — each unit is always 1 bedroom
    return [{ value: "1", label: "1" }]
  }
  // r4, r5, r7 — units may differ
  return [
    { value: "0",     label: "Studio" },
    { value: "1",     label: "1" },
    { value: "2",     label: "2" },
    { value: "3",     label: "3" },
    { value: "mixed", label: "Mixed" },
  ]
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
  const { tier } = useTier()
  const showAgentFlagCopy = tier === "portfolio" || tier === "firm"

  const scenario            = state.scenarioType ? getScenario(state.scenarioType) : null
  const preselectedScheme   = scenario?.preselectSchemeType ?? null
  const schemePreselected   = preselectedScheme !== null

  const isResidential = ["r1","r2","r3","r4","r5","r6","r7"].includes(state.scenarioType ?? "")

  // Derive initial local state from existing universals / hints
  const [local, setLocal] = useState<LocalState>(() => {
    const h = state.unitHints
    const base = {
      bedroomPick:   hintsToBedroomPick(h.unitType, h.bedrooms),
      bedroomsOther: h.bedrooms !== null && h.bedrooms > 3 ? h.bedrooms : null,
      furnishing:    h.furnishingStatus,
      bathrooms:     h.bathrooms,
      sizeM2:        h.sizeM2,
    }
    if (state.universals) {
      return {
        schemeOption: schemePreselected
          ? (preselectedScheme as SchemeOption)
          : answersToSchemeOption(state.universals),
        schemeName:  state.universals.schemeName ?? "",
        wifi:        state.universals.wifiAvailable,
        cellSignal:  state.universals.cellSignalQuality,
        backupPower: state.universals.backupPower,
        ...base,
      }
    }
    return {
      schemeOption: schemePreselected ? (preselectedScheme as SchemeOption) : null,
      schemeName:   "",
      wifi:         null,
      cellSignal:   null,
      backupPower:  null,
      ...base,
    }
  })

  // Sync local → context (universals + unitHints) after every local change
  useEffect(() => {
    const hints: UnitHints = {
      unitType:         pickToUnitType(local.bedroomPick),
      bedrooms:         pickToBedrooms(local.bedroomPick, local.bedroomsOther),
      bathrooms:        local.bathrooms,
      furnishingStatus: local.furnishing,
      sizeM2:           local.sizeM2,
    }
    patch({ universals: localToAnswers(local), unitHints: hints })
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
        <div className="rounded-[var(--r-button)] border border-border bg-muted/30 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">Managing scheme: </span>
          <span className="text-muted-foreground">
            {preselectedScheme === "body_corporate"
              ? "Body corporate (pre-selected for sectional title)"
              : "Homeowners association (pre-selected for estate)"}
          </span>
          <div className="mt-3">
            <InlineRow label="Scheme name" htmlFor="scheme-name-preselected">
              <WInput
                id="scheme-name-preselected"
                value={local.schemeName}
                onChange={(v) => update({ schemeName: v })}
                placeholder={preselectedScheme === "body_corporate" ? "e.g. Vineyard Heights Body Corporate" : "e.g. Blue Ridge Estate HOA"}
              />
            </InlineRow>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <InlineSegment
            label="Managing scheme?"
            options={[
              { value: "no",             label: "No" },
              { value: "body_corporate", label: "Body Corporate" },
              { value: "hoa",            label: "HOA" },
              { value: "share_block",    label: "Share block" },
              { value: "other_scheme",   label: "Other" },
              { value: "not_sure",       label: "Not sure" },
            ]}
            value={local.schemeOption}
            onChange={(v) => update({ schemeOption: v as SchemeOption })}
          />
          {showSchemeName && (
            <InlineRow label="Scheme name" required htmlFor="scheme-name">
              <WInput
                id="scheme-name"
                value={local.schemeName}
                onChange={(v) => update({ schemeName: v })}
                placeholder="e.g. Vineyard Heights Body Corporate"
              />
            </InlineRow>
          )}
        </div>
      )}

      {/* Unit details — residential scenarios */}
      {isResidential && (
        <div className="border-t pt-4 space-y-3">

          {/* Bedrooms — scenario-specific options, encodes unit type too */}
          <div className="space-y-1.5">
            <InlineSegment
              label="Bedrooms"
              options={getBedroomOptions(state.scenarioType)}
              value={local.bedroomPick}
              onChange={(v) => update({ bedroomPick: v, bedroomsOther: null })}
            />
            {local.bedroomPick === "other" && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-36 shrink-0" aria-hidden />
                <div className="w-32">
                  <WInput
                    inputMode="numeric"
                    aria-label="Bedroom count"
                    placeholder="How many?"
                    autoFocus
                    value={local.bedroomsOther === null ? "" : String(local.bedroomsOther)}
                    onChange={(v) => {
                      const n = v === "" ? null : Number(v)
                      update({ bedroomsOther: Number.isNaN(n ?? 0) ? null : n })
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Bathrooms — capped at 2 for flatlets */}
          <InlineSegment
            label="Bathrooms"
            options={
              state.scenarioType === "r1"
                ? [{ value: "1", label: "1" }, { value: "2", label: "2" }]
                : [{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3+" }]
            }
            value={local.bathrooms === null ? null : String(local.bathrooms)}
            onChange={(v) => update({ bathrooms: Number(v) })}
          />

          <InlineSegment
            label="Furnished"
            options={[
              { value: "unfurnished",    label: "No" },
              { value: "semi_furnished", label: "Semi" },
              { value: "furnished",      label: "Yes" },
            ]}
            value={local.furnishing}
            onChange={(v) => update({ furnishing: v as FurnishingVal })}
          />

          <InlineRow label="Size m²" htmlFor="unit-size">
            <div className="w-32">
              <WInput
                id="unit-size"
                inputMode="numeric"
                placeholder="e.g. 85"
                value={local.sizeM2 === null ? "" : String(local.sizeM2)}
                onChange={(v) => {
                  const n = v === "" ? null : Number(v)
                  update({ sizeM2: Number.isNaN(n ?? 0) ? null : n })
                }}
              />
            </div>
          </InlineRow>
        </div>
      )}

      {/* WiFi / fibre */}
      <div className="space-y-1">
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
        {showAgentFlagCopy && local.wifi === "unknown" && (
          <p className="pl-36 text-xs text-muted-foreground">
            We&apos;ll flag this for the servicing agent to confirm on their first site visit.
          </p>
        )}
      </div>

      {/* Cell signal */}
      <div className="space-y-1">
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
        {showAgentFlagCopy && local.cellSignal === "unknown" && (
          <p className="pl-36 text-xs text-muted-foreground">
            We&apos;ll flag this for the servicing agent to confirm on their first site visit.
          </p>
        )}
      </div>

      {/* Backup power */}
      <div className="space-y-1">
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
        {showAgentFlagCopy && local.backupPower === "unknown" && (
          <p className="pl-36 text-xs text-muted-foreground">
            We&apos;ll flag this for the servicing agent to confirm on their first site visit.
          </p>
        )}
      </div>
    </div>
  )
}
