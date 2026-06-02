"use client"

/**
 * app/(dashboard)/properties/new/steps/StepAddress.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { getScenario } from "@/lib/properties/scenarios"
import { useWizard, type WizardAddress } from "../WizardContext"
import { WSection, WField, WInput, WSelect } from "./fields"

// ── SA provinces ──────────────────────────────────────────────────────────────

const SA_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
]
const PROVINCE_OPTIONS = [{ value: "", label: "Select…" }, ...SA_PROVINCES.map((p) => ({ value: p, label: p }))]

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
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search address…"
        autoComplete="off"
        className="h-11 w-full rounded-[var(--r-button)] border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/30 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
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
    <div className="space-y-6">
      <PlacesSearch onPlace={(partial) => {
        setPropertyNameTouched(false)
        update(partial)
      }} />

      <div>
        <WSection n="01">Address</WSection>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <WField label="Street number" htmlFor="addr-street-number">
            <WInput id="addr-street-number" value={local.street_number} onChange={(v) => update({ street_number: v })} placeholder="42" inputMode="numeric" />
          </WField>
          <WField label="Street name" htmlFor="addr-street-name">
            <WInput id="addr-street-name" value={local.street_name} onChange={(v) => update({ street_name: v })} placeholder="Vineyard Road" />
          </WField>
          <WField label="Building / unit" span htmlFor="addr-line2">
            <WInput id="addr-line2" value={local.address_line2} onChange={(v) => update({ address_line2: v })} placeholder="Building name, unit no., floor…" />
          </WField>
          <WField label="Suburb" htmlFor="addr-suburb">
            <WInput id="addr-suburb" value={local.suburb} onChange={(v) => update({ suburb: v })} placeholder="Constantia" />
          </WField>
          <WField label="City" required htmlFor="addr-city">
            <WInput id="addr-city" value={local.city} onChange={(v) => update({ city: v })} placeholder="Cape Town" />
          </WField>
          <WField label="Postal code" htmlFor="addr-postal">
            <WInput id="addr-postal" value={local.postal_code} onChange={(v) => update({ postal_code: v.replaceAll(/\D/g, "") })} placeholder="7806" inputMode="numeric" maxLength={4} />
          </WField>
          <WField label="Province" required htmlFor="addr-province">
            <WSelect id="addr-province" value={local.province} onChange={(v) => update({ province: v })} options={PROVINCE_OPTIONS} />
          </WField>
          <WField label="Erf no." htmlFor="addr-erf">
            <WInput id="addr-erf" value={local.erf_number ?? ""} onChange={(v) => update({ erf_number: v || null })} placeholder="e.g. 1234" />
          </WField>
          {isSectional && (
            <WField label="Sectional scheme no." htmlFor="addr-st">
              <WInput id="addr-st" value={local.sectional_title_number ?? ""} onChange={(v) => update({ sectional_title_number: v || null })} placeholder="SS123/2015" />
            </WField>
          )}
        </div>
      </div>

      <div>
        <WSection n="02">Property name</WSection>
        <WField
          label="Property name" required span htmlFor="addr-property-name"
          hint={"Shown in dashboards, statements, and lease documents." + (scenario ? ` Suggested as "${scenario.label.toLowerCase()}" style — edit to taste.` : "")}
        >
          <WInput
            id="addr-property-name" value={local.property_name}
            onChange={(v) => { setPropertyNameTouched(true); update({ property_name: v }) }}
            placeholder="Auto-suggested from the address above"
          />
        </WField>
      </div>
    </div>
  )
}
