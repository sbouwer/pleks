"use client"

/**
 * app/(dashboard)/properties/new/steps/StepOperatingHours.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useWizard } from "../WizardContext"
import { OptionRow } from "../OptionRow"
import { WField, WInput } from "./fields"

// ── Preset options ────────────────────────────────────────────────────────────

const PRESET_OPTIONS = [
  { value: "standard_business", label: "Standard business",  sub: "Mon–Fri 08:00–17:00" },
  { value: "extended",          label: "Extended hours",     sub: "Mon–Fri 07:00–19:00, Sat 09:00–13:00" },
  { value: "retail",            label: "Retail",             sub: "Mon–Sat 09:00–18:00, Sun 10:00–14:00" },
  { value: "24_7",              label: "24 / 7" },
  { value: "custom",            label: "Custom",             sub: "Set per day after creation" },
]

const AFTER_HOURS_OPTIONS = [
  { value: "unrestricted",  label: "Yes — unrestricted" },
  { value: "with_notice",   label: "Yes — with prior notice",  sub: "Tenant must notify before accessing outside hours" },
  { value: "not_permitted", label: "No — not permitted" },
]

// ── Shared radio row ──────────────────────────────────────────────────────────

interface RadioOption {
  value: string
  label: string
  sub?:  string
}

interface RadioGroupProps {
  label:   string
  options: RadioOption[]
  value:   string | null
  onChange: (v: string) => void
}

function RadioGroup({ label, options, value, onChange }: RadioGroupProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="space-y-1.5">
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

// ── StepOperatingHours ────────────────────────────────────────────────────────

export function StepOperatingHours() {
  const { state, patch } = useWizard()

  const showNoticeFields =
    state.afterHoursAccess === "with_notice" ||
    state.operatingHoursPreset === "custom"

  return (
    <div className="space-y-6">
      <RadioGroup
        label="Operating hours for this building"
        options={PRESET_OPTIONS}
        value={state.operatingHoursPreset}
        onChange={(v) => patch({ operatingHoursPreset: v })}
      />

      <RadioGroup
        label="Can tenants access the space outside operating hours?"
        options={AFTER_HOURS_OPTIONS}
        value={state.afterHoursAccess}
        onChange={(v) => patch({ afterHoursAccess: v })}
      />

      {showNoticeFields && (
        <div className="space-y-4 rounded-[var(--r-button)] border border-border bg-muted/20 p-4">
          <WField label="Notice period (hours before access)" htmlFor="notice-hours">
            <div className="w-32">
              <WInput
                id="notice-hours"
                type="number"
                inputMode="numeric"
                min={1}
                max={168}
                placeholder="24"
                value={state.afterHoursNoticeHours === null ? "" : String(state.afterHoursNoticeHours)}
                onChange={(v) => {
                  const n = Number.parseInt(v, 10)
                  patch({ afterHoursNoticeHours: Number.isNaN(n) ? null : n })
                }}
              />
            </div>
          </WField>
          <WField label="Notes (optional)" htmlFor="after-hours-notes">
            <textarea
              id="after-hours-notes"
              rows={2}
              placeholder="e.g. Contact building manager at least 24 hours in advance"
              value={state.afterHoursNotes ?? ""}
              onChange={(e) => patch({ afterHoursNotes: e.target.value || null })}
              className="w-full resize-none rounded-[var(--r-button)] border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
            />
          </WField>
        </div>
      )}
    </div>
  )
}
