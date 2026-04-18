"use client"

import { useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { getScenario } from "@/lib/properties/scenarios"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWizard, type WizardAddress } from "../WizardContext"

// ── SA provinces ──────────────────────────────────────────────────────────────

const SA_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
]

// ── Property name suggestion ──────────────────────────────────────────────────

const SCENARIO_NAME_PREFIXES: Record<string, string> = {
  r1: "Flatlet at", r2: "", r3: "Apartment at", r4: "Units at", r5: "Estate at",
  c1: "", c2: "Commercial block at", c3: "Warehouse at", c4: "Commercial park at",
  m1: "Mixed-use at", m2: "Development at",
}

function suggestPropertyName(streetNumber: string, streetName: string, suburb: string, scenarioType: string | null): string {
  const streetAddress = [streetNumber, streetName].filter(Boolean).join(" ").trim()
  if (!streetAddress) return ""
  const prefix = scenarioType ? SCENARIO_NAME_PREFIXES[scenarioType] ?? "" : ""
  const core   = prefix ? `${prefix} ${streetAddress}` : streetAddress
  return suburb ? `${core}, ${suburb}` : core
}

// ── Google Places type declarations ──────────────────────────────────────────

declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts: object,
          ) => {
            addListener: (event: string, cb: () => void) => void
            getPlace: () => GooglePlace
          }
        }
      }
    }
    initPleksAutocomplete?: () => void
  }
}

interface GooglePlace {
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
  geometry?: { location: { lat: () => number; lng: () => number } }
  place_id?: string
  formatted_address?: string
}

// ── Google Places search bar ──────────────────────────────────────────────────

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

interface PlacesSearchProps {
  onPlace: (addr: Partial<WizardAddress>) => void
}

function PlacesSearch({ onPlace }: Readonly<PlacesSearchProps>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!MAPS_KEY) return

    if (window.google?.maps?.places) {
      // Already loaded (e.g. hot-reload) — mark ready on next tick to avoid setState-in-effect
      const id = setTimeout(() => setReady(true), 0)
      return () => clearTimeout(id)
    }

    window.initPleksAutocomplete = () => setReady(true)
    if (document.getElementById("pleks-gmaps")) return

    const script   = document.createElement("script")
    script.id      = "pleks-gmaps"
    script.src     = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&callback=initPleksAutocomplete`
    script.async   = true
    script.defer   = true
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!ready || !inputRef.current) return

    const ac = new window.google!.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "za" },
      fields: ["address_components", "geometry", "place_id", "formatted_address"],
      types: ["address"],
    })

    ac.addListener("place_changed", () => {
      const place = ac.getPlace()
      if (!place.address_components) return

      const get = (type: string, short = false) => {
        const c = place.address_components!.find((x) => x.types.includes(type))
        if (!c) return ""
        return short ? c.short_name : c.long_name
      }

      // Map Google's admin_area_level_1 short name to full SA province name
      const provinceShort = get("administrative_area_level_1", true)
      const PROVINCE_MAP: Record<string, string> = {
        EC: "Eastern Cape", FS: "Free State", GP: "Gauteng", KZN: "KwaZulu-Natal",
        LP: "Limpopo", MP: "Mpumalanga", NC: "Northern Cape", NW: "North West", WC: "Western Cape",
      }

      onPlace({
        street_number:   get("street_number"),
        street_name:     get("route"),
        suburb:          get("sublocality_level_1") || get("locality"),
        city:            get("locality") || get("administrative_area_level_2"),
        province:        PROVINCE_MAP[provinceShort] ?? get("administrative_area_level_1"),
        postal_code:     get("postal_code"),
        country:         "ZA",
        lat:             place.geometry?.location.lat() ?? null,
        lng:             place.geometry?.location.lng() ?? null,
        google_place_id: place.place_id ?? null,
        formatted:       place.formatted_address ?? "",
      })

      // Clear the search input so the field rows show the result
      if (inputRef.current) inputRef.current.value = ""
    })
  }, [ready, onPlace])

  if (!MAPS_KEY) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <Search className="w-3.5 h-3.5 shrink-0" />
        Address search not available — NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not configured
      </div>
    )
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search address…"
        className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
      />
    </div>
  )
}

// ── Inline field ──────────────────────────────────────────────────────────────

interface FieldProps {
  id:           string
  label:        string
  value:        string
  placeholder?: string
  required?:    boolean
  inputMode?:   React.HTMLAttributes<HTMLInputElement>["inputMode"]
  maxLength?:   number
  onChange:     (v: string) => void
  inputWidth?:  string
}

function Field({ id, label, value, placeholder, required, inputMode, maxLength, onChange, inputWidth = "flex-1" }: Readonly<FieldProps>) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-28 shrink-0 text-sm font-medium text-right leading-none">
        {label}{required && <span className="ml-0.5 text-destructive text-xs">*</span>}
      </label>
      <input
        id={id}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputWidth, "rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow")}
      />
    </div>
  )
}

// ── StepAddress ───────────────────────────────────────────────────────────────

const EMPTY_ADDRESS: WizardAddress = {
  formatted: "", street_number: "", street_name: "", address_line2: "",
  suburb: "", city: "", province: "", postal_code: "", country: "ZA",
  lat: null, lng: null, google_place_id: null,
  property_name: "", erf_number: null, sectional_title_number: null,
}

export function StepAddress() {
  const { state, patch } = useWizard()
  const [local, setLocal]                     = useState<WizardAddress>(state.address ?? EMPTY_ADDRESS)
  const [propertyNameTouched, setPropertyNameTouched] = useState((state.address?.property_name ?? "").length > 0)

  const scenario   = state.scenarioType ? getScenario(state.scenarioType) : null
  const isSectional = state.scenarioType === "r3"

  function update(partial: Partial<WizardAddress>) {
    setLocal((prev) => {
      const next = { ...prev, ...partial }
      if (!propertyNameTouched) {
        next.property_name = suggestPropertyName(next.street_number, next.street_name, next.suburb, state.scenarioType)
      }
      next.formatted = [
        [next.street_number, next.street_name].filter(Boolean).join(" "),
        next.address_line2,
        next.suburb, next.city, next.province, next.postal_code,
      ].filter(Boolean).join(", ")
      return next
    })
  }

  useEffect(() => {
    patch({ address: local })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-heading text-2xl mb-0.5">Where is the property?</h2>
        <p className="text-muted-foreground text-xs">
          Used to pre-fill lease clauses, route municipal info, and label statements.
        </p>
      </div>

      <PlacesSearch onPlace={(partial) => {
        setPropertyNameTouched(false)
        update(partial)
      }} />

      <div className="space-y-2">
        {/* Street number + name */}
        <div className="flex items-center gap-3">
          <label htmlFor="addr-street-number" className="w-28 shrink-0 text-sm font-medium text-right">Street</label>
          <input
            id="addr-street-number"
            type="text" placeholder="42"
            value={local.street_number}
            onChange={(e) => update({ street_number: e.target.value })}
            aria-label="Street number"
            className="w-14 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
          />
          <input
            id="addr-street-name"
            type="text" placeholder="Vineyard Road"
            value={local.street_name}
            onChange={(e) => update({ street_name: e.target.value })}
            aria-label="Street name"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
          />
        </div>

        {/* Address line 2 */}
        <Field id="addr-line2" label="Building / unit" value={local.address_line2}
          placeholder="Building name, unit no., floor…"
          onChange={(v) => update({ address_line2: v })} />

        <Field id="addr-suburb" label="Suburb" value={local.suburb} placeholder="Constantia"
          onChange={(v) => update({ suburb: v })} />

        {/* City + postal */}
        <div className="flex items-center gap-3">
          <label htmlFor="addr-city" className="w-28 shrink-0 text-sm font-medium text-right">
            City <span className="text-destructive text-xs">*</span>
          </label>
          <input
            id="addr-city" type="text" placeholder="Cape Town"
            value={local.city}
            onChange={(e) => update({ city: e.target.value })}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
          />
          <input
            id="addr-postal" type="text" inputMode="numeric" maxLength={4} placeholder="7806"
            value={local.postal_code}
            onChange={(e) => update({ postal_code: e.target.value.replaceAll(/\D/g, "") })}
            aria-label="Postal code"
            className="w-16 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
          />
        </div>

        {/* Province + Erf on same row */}
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="addr-province" className="w-28 shrink-0 text-sm font-medium text-right">
            Province <span className="text-destructive text-xs">*</span>
          </label>
          <Select value={local.province} onValueChange={(v) => update({ province: v ?? "" })}>
            <SelectTrigger id="addr-province" className="w-44">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {SA_PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <label htmlFor="addr-erf" className="text-sm font-medium shrink-0">Erf no.</label>
          <input
            id="addr-erf" type="text" placeholder="e.g. 1234"
            value={local.erf_number ?? ""}
            onChange={(e) => update({ erf_number: e.target.value || null })}
            className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
          />
          {isSectional && (
            <>
              <span className="text-sm font-medium shrink-0">SS no.</span>
              <input
                id="addr-st" type="text" placeholder="SS123/2015"
                value={local.sectional_title_number ?? ""}
                onChange={(e) => update({ sectional_title_number: e.target.value || null })}
                className="w-28 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-shadow"
              />
            </>
          )}
        </div>
      </div>

      {/* Property name */}
      <div className="pt-2 border-t space-y-1">
        <Field
          id="addr-property-name" label="Property name"
          value={local.property_name}
          placeholder="Auto-suggested from the address above"
          required
          onChange={(v) => { setPropertyNameTouched(true); update({ property_name: v }) }}
        />
        <p className="pl-[7.25rem] text-xs text-muted-foreground">
          Shown in dashboards, statements, and lease documents.
          {scenario && ` Suggested as "${scenario.label.toLowerCase()}" style — edit to taste.`}
        </p>
      </div>
    </div>
  )
}
