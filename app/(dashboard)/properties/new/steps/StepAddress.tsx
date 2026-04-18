"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { getScenario } from "@/lib/properties/scenarios"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWizard, type WizardAddress } from "../WizardContext"

// ── SA provinces ──────────────────────────────────────────────────────────────

const SA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
]

// ── Property name suggestion ──────────────────────────────────────────────────

const SCENARIO_NAME_PREFIXES: Record<string, string> = {
  r1: "Flatlet at",
  r2: "",
  r3: "Apartment at",
  r4: "Units at",
  r5: "Estate at",
  c1: "",
  c2: "Commercial block at",
  c3: "Warehouse at",
  c4: "Commercial park at",
  m1: "Mixed-use at",
  m2: "Development at",
}

function suggestPropertyName(
  streetNumber: string,
  streetName: string,
  suburb: string,
  scenarioType: string | null,
): string {
  const streetAddress = [streetNumber, streetName].filter(Boolean).join(" ").trim()
  if (!streetAddress) return ""

  const prefix = scenarioType ? SCENARIO_NAME_PREFIXES[scenarioType] ?? "" : ""
  const core   = prefix ? `${prefix} ${streetAddress}` : streetAddress
  return suburb ? `${core}, ${suburb}` : core
}

// ── Initial state from wizard ─────────────────────────────────────────────────

const EMPTY_ADDRESS: WizardAddress = {
  formatted:              "",
  street_number:          "",
  street_name:            "",
  suburb:                 "",
  city:                   "",
  province:               "",
  postal_code:            "",
  country:                "ZA",
  lat:                    null,
  lng:                    null,
  google_place_id:        null,
  property_name:          "",
  erf_number:             null,
  sectional_title_number: null,
}

// ── Field primitive ───────────────────────────────────────────────────────────

interface FieldProps {
  id:           string
  label:        string
  value:        string
  placeholder?: string
  required?:    boolean
  type?:        string
  inputMode?:   React.HTMLAttributes<HTMLInputElement>["inputMode"]
  maxLength?:   number
  onChange:     (v: string) => void
  className?:   string
}

function Field({ id, label, value, placeholder, required, type = "text", inputMode, maxLength, onChange, className }: FieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-destructive text-xs">*</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
      />
    </div>
  )
}

// ── StepAddress ───────────────────────────────────────────────────────────────

export function StepAddress() {
  const { state, patch } = useWizard()
  const [local, setLocal] = useState<WizardAddress>(state.address ?? EMPTY_ADDRESS)
  const [propertyNameTouched, setPropertyNameTouched] = useState(
    (state.address?.property_name ?? "").length > 0,
  )

  const scenario = state.scenarioType ? getScenario(state.scenarioType) : null
  const isSectional = state.scenarioType === "r3"

  function update(partial: Partial<WizardAddress>) {
    setLocal((prev) => {
      const next = { ...prev, ...partial }
      // Auto-suggest property name if untouched
      if (!propertyNameTouched) {
        next.property_name = suggestPropertyName(
          next.street_number,
          next.street_name,
          next.suburb,
          state.scenarioType,
        )
      }
      // Maintain formatted address string for downstream consumers
      next.formatted = [
        [next.street_number, next.street_name].filter(Boolean).join(" "),
        next.suburb,
        next.city,
        next.province,
        next.postal_code,
      ].filter(Boolean).join(", ")
      return next
    })
  }

  // Sync to wizard context whenever local address changes meaningfully
  useEffect(() => {
    patch({ address: local })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  function handlePropertyNameChange(value: string) {
    setPropertyNameTouched(true)
    update({ property_name: value })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl mb-1">Where is the property?</h2>
        <p className="text-muted-foreground text-sm">
          We&apos;ll use this to label the property, route municipal and scheme info correctly,
          and pre-fill lease clauses specific to the province.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Field
          id="addr-street-number"
          label="Street no."
          value={local.street_number}
          placeholder="42"
          onChange={(v) => update({ street_number: v })}
          className="sm:col-span-1"
        />
        <Field
          id="addr-street-name"
          label="Street name"
          value={local.street_name}
          placeholder="Vineyard Road"
          required
          onChange={(v) => update({ street_name: v })}
          className="sm:col-span-3"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          id="addr-suburb"
          label="Suburb"
          value={local.suburb}
          placeholder="Constantia"
          onChange={(v) => update({ suburb: v })}
        />
        <Field
          id="addr-city"
          label="City"
          value={local.city}
          placeholder="Cape Town"
          required
          onChange={(v) => update({ city: v })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium">
            Province <span className="ml-1 text-destructive text-xs">*</span>
          </label>
          <Select value={local.province} onValueChange={(v) => update({ province: v ?? "" })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a province…" />
            </SelectTrigger>
            <SelectContent>
              {SA_PROVINCES.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field
          id="addr-postal"
          label="Postal code"
          value={local.postal_code}
          placeholder="7806"
          inputMode="numeric"
          maxLength={4}
          onChange={(v) => update({ postal_code: v.replaceAll(/\D/g, "") })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          id="addr-erf"
          label="Erf number"
          value={local.erf_number ?? ""}
          placeholder="e.g. 1234 Constantia"
          onChange={(v) => update({ erf_number: v || null })}
        />
        {isSectional && (
          <Field
            id="addr-st"
            label="Sectional title number"
            value={local.sectional_title_number ?? ""}
            placeholder="e.g. SS123/2015"
            onChange={(v) => update({ sectional_title_number: v || null })}
          />
        )}
      </div>

      <div className="pt-3 border-t">
        <Field
          id="addr-property-name"
          label="Property name"
          value={local.property_name}
          placeholder="Auto-suggested from the address above"
          required
          onChange={handlePropertyNameChange}
        />
        <p className="text-xs text-muted-foreground mt-1">
          This is what you&apos;ll see in dashboards, statements, and lease documents.
          {scenario && ` We've suggested a "${scenario.label.toLowerCase()}" style label — edit to taste.`}
        </p>
      </div>
    </div>
  )
}
