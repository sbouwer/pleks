"use client"

import { useWizard } from "../WizardContext"
import { OptionRow } from "../OptionRow"

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
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-2xl mb-1">Operating hours</h2>
        <p className="text-muted-foreground text-sm">
          Drives access rules, after-hours clauses, and maintenance scheduling.
        </p>
      </div>

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
        <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <div className="space-y-1.5">
            <label htmlFor="notice-hours" className="text-sm font-medium block">
              Notice period (hours before access)
            </label>
            <input
              id="notice-hours"
              type="number"
              min={1}
              max={168}
              placeholder="24"
              value={state.afterHoursNoticeHours ?? ""}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                patch({ afterHoursNoticeHours: Number.isNaN(n) ? null : n })
              }}
              className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="after-hours-notes" className="text-sm font-medium block">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="after-hours-notes"
              rows={2}
              placeholder="e.g. Contact building manager at least 24 hours in advance"
              value={state.afterHoursNotes ?? ""}
              onChange={(e) => patch({ afterHoursNotes: e.target.value || null })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}
