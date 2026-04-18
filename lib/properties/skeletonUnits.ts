/**
 * lib/properties/skeletonUnits.ts
 *
 * Pure function that generates skeleton unit arrays from wizard answers.
 * No DB access, no side effects. Consumed by createPropertyFromWizard.
 *
 * Every property must have ≥1 lettable unit on save (spec §2 decision 6).
 */

import type { ScenarioType } from "./scenarios"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkeletonUnit {
  unit_number:            string
  unit_type:              string | null
  bedrooms:               number | null
  bathrooms:              number | null
  parking_bays:           number | null
  floor:                  number | null
  size_m2:                number | null
  furnishing_status:      "unfurnished" | "semi_furnished" | "furnished" | null
  is_lettable:            boolean
  status:                 "vacant"
  business_use_permitted: "not_permitted" | "home_office_only" | "practice_consultancy" | "commercial_activity"
  // Industrial columns (null for non-industrial)
  roller_door_count:      number | null
  loading_bay_type:       string | null
  three_phase_power:      boolean | null
  floor_loading:          string | null
  clear_height_category:  string | null
  office_component_pct:   string | null
  has_crane:              boolean | null
  hazmat_approved:        boolean | null
  rail_siding:            boolean | null
}

export interface SkeletonInput {
  scenarioType:    ScenarioType
  propertyName:    string
  scenarioAnswers: Record<string, unknown>
  /** Total unit count for "counted" scenarios (captured on the scenario card) */
  unitCount?:      number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseUnit(overrides: Partial<SkeletonUnit> & { unit_number: string }): SkeletonUnit {
  return {
    unit_type:              null,
    bedrooms:               null,
    bathrooms:              null,
    parking_bays:           null,
    floor:                  null,
    size_m2:                null,
    furnishing_status:      null,
    is_lettable:            true,
    status:                 "vacant",
    business_use_permitted: "not_permitted",
    roller_door_count:      null,
    loading_bay_type:       null,
    three_phase_power:      null,
    floor_loading:          null,
    clear_height_category:  null,
    office_component_pct:   null,
    has_crane:              null,
    hazmat_approved:        null,
    rail_siding:            null,
    ...overrides,
  }
}

function safeFurnishing(
  value: unknown,
): "unfurnished" | "semi_furnished" | "furnished" {
  if (value === "semi_furnished" || value === "furnished") return value
  return "unfurnished"
}

function residentialType(bedrooms: number | null): string {
  if (bedrooms === null) return "residential_unknown"
  if (bedrooms === 0)    return "residential_studio"
  if (bedrooms === 1)    return "residential_1bed"
  if (bedrooms === 2)    return "residential_2bed"
  return "residential_3bed"
}

function flatletTypeToUnit(flatletType: string): { unit_type: string; bedrooms: number | null } {
  if (flatletType === "studio") return { unit_type: "residential_studio", bedrooms: 0 }
  if (flatletType === "2bed")   return { unit_type: "residential_2bed",   bedrooms: 2 }
  return { unit_type: "residential_1bed", bedrooms: 1 }
}

// ── Scenario generators ───────────────────────────────────────────────────────

function r1(input: SkeletonInput): SkeletonUnit[] {
  const { propertyName, scenarioAnswers: a } = input
  const flatletLabel   = String(a.flatlet_label ?? "Garden cottage")
  const flatletType    = String(a.flatlet_type  ?? "1bed")
  const furnished      = safeFurnishing(a.furnished)
  const businessUse    = (a.business_use as SkeletonUnit["business_use_permitted"]) ?? "not_permitted"
  const { unit_type, bedrooms } = flatletTypeToUnit(flatletType)

  return [
    baseUnit({
      unit_number:   propertyName,
      unit_type:     "residential_house",
      is_lettable:   false,
    }),
    baseUnit({
      unit_number:            flatletLabel,
      unit_type,
      bedrooms,
      furnishing_status:      furnished,
      business_use_permitted: businessUse,
    }),
  ]
}

function r2(input: SkeletonInput): SkeletonUnit[] {
  const { propertyName, scenarioAnswers: a } = input
  const bedrooms    = a.bedrooms    != null ? Number(a.bedrooms)    : null
  const bathrooms   = a.bathrooms   != null ? Number(a.bathrooms)   : null
  const parkingBays = a.parking_bays != null ? Number(a.parking_bays) : null
  const businessUse = (a.business_use as SkeletonUnit["business_use_permitted"]) ?? "not_permitted"

  return [
    baseUnit({
      unit_number:            propertyName,
      unit_type:              "residential_house",
      bedrooms,
      bathrooms,
      parking_bays:           parkingBays,
      furnishing_status:      "unfurnished",
      business_use_permitted: businessUse,
    }),
  ]
}

function r3(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a } = input
  const bedrooms    = a.bedrooms != null ? Number(a.bedrooms) : null
  const floor       = a.floor    != null ? Number(a.floor)    : null
  const secNum      = a.section_number ? `Section ${String(a.section_number)}` : "Section"
  const parkingType = String(a.parking_type ?? "none")
  const parkingBays = parkingType === "none" || parkingType === "visitor" ? 0 : 1
  const businessUse = (a.business_use as SkeletonUnit["business_use_permitted"]) ?? "not_permitted"

  return [
    baseUnit({
      unit_number:            secNum,
      unit_type:              residentialType(bedrooms),
      bedrooms,
      floor,
      parking_bays:           parkingBays,
      furnishing_status:      "unfurnished",
      business_use_permitted: businessUse,
    }),
  ]
}

function r4(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a, unitCount = 2 } = input
  const identical   = a.identical_layout === true
  const bedrooms    = identical && a.bedrooms_default != null ? Number(a.bedrooms_default) : null
  const furnishing  = identical ? safeFurnishing(a.furnishing_default) : null
  const unitType    = identical ? residentialType(bedrooms) : "residential_unknown"

  return Array.from({ length: unitCount }, (_, i) =>
    baseUnit({
      unit_number:       `Unit ${i + 1}`,
      unit_type:         unitType,
      bedrooms,
      furnishing_status: furnishing,
    }),
  )
}

function r5(input: SkeletonInput): SkeletonUnit[] {
  const { unitCount = 4 } = input
  return Array.from({ length: unitCount }, (_, i) =>
    baseUnit({
      unit_number:       `Unit ${i + 1}`,
      unit_type:         "residential_unknown",
      furnishing_status: "unfurnished",
    }),
  )
}

function c1(input: SkeletonInput): SkeletonUnit[] {
  const { propertyName, scenarioAnswers: a } = input
  const sizeM2   = a.size_m2    != null ? Number(a.size_m2)    : null
  const parking  = a.parking_bays != null ? Number(a.parking_bays) : null
  const useType  = String(a.use_type ?? "office")
  let unitType   = "commercial_office"
  if (useType === "retail" || useType === "restaurant") unitType = "commercial_retail"

  return [
    baseUnit({
      unit_number:   propertyName,
      unit_type:     unitType,
      size_m2:       sizeM2,
      parking_bays:  parking,
    }),
  ]
}

function c2(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a, unitCount = 3 } = input
  const mixType  = String(a.mix_type ?? "mixed")
  let unitType   = "commercial"
  if (mixType === "all_retail") unitType = "commercial_retail"
  else if (mixType === "all_office") unitType = "commercial_office"

  return Array.from({ length: unitCount }, (_, i) =>
    baseUnit({
      unit_number: `Unit ${i + 1}`,
      unit_type:   unitType,
    }),
  )
}

function c3(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a, unitCount = 1 } = input
  const sizeM2        = a.size_m2             != null ? Number(a.size_m2)             : null
  const rollerDoors   = a.roller_door_count   != null ? Number(a.roller_door_count)   : null
  const loadingBay    = a.loading_bay_type    ? String(a.loading_bay_type)    : null
  const threePh       = a.three_phase_power   === true
  const floorLoading  = a.floor_loading       ? String(a.floor_loading)       : null
  const clearHeight   = a.clear_height_category ? String(a.clear_height_category) : null
  const officePct     = a.office_component_pct  ? String(a.office_component_pct)  : null
  const hasCrane      = a.has_crane    === true
  const hazmat        = a.hazmat_approved === true
  const rail          = a.rail_siding  === true

  return Array.from({ length: unitCount }, (_, i) =>
    baseUnit({
      unit_number:           `Unit ${i + 1}`,
      unit_type:             "industrial_warehouse",
      size_m2:               sizeM2,
      roller_door_count:     rollerDoors,
      loading_bay_type:      loadingBay,
      three_phase_power:     threePh,
      floor_loading:         floorLoading,
      clear_height_category: clearHeight,
      office_component_pct:  officePct,
      has_crane:             hasCrane,
      hazmat_approved:       hazmat,
      rail_siding:           rail,
    }),
  )
}

function c4(input: SkeletonInput): SkeletonUnit[] {
  const { unitCount = 4 } = input
  return Array.from({ length: unitCount }, (_, i) =>
    baseUnit({
      unit_number: `Unit ${i + 1}`,
      unit_type:   "commercial",
    }),
  )
}

function m1(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a, unitCount = 4 } = input

  // unitCount split: first half retail, rest residential (floor division)
  const retailCount      = Math.max(1, Math.floor(unitCount / 2))
  const residentialCount = Math.max(1, unitCount - retailCount)

  const retailSizeM2    = a.retail_size_m2 != null ? Number(a.retail_size_m2) : null
  const bedroomMix      = String(a.residential_bedroom_mix ?? "1bed")
  let resType = "residential_1bed"
  let resBeds = 1
  if (bedroomMix === "studio") { resType = "residential_studio"; resBeds = 0 }
  else if (bedroomMix === "2bed") { resType = "residential_2bed"; resBeds = 2 }

  const retailUnits: SkeletonUnit[] = Array.from({ length: retailCount }, (_, i) =>
    baseUnit({
      unit_number: `Shop ${i + 1}`,
      unit_type:   "commercial_retail",
      size_m2:     retailSizeM2,
    }),
  )

  const residentialUnits: SkeletonUnit[] = Array.from({ length: residentialCount }, (_, i) =>
    baseUnit({
      unit_number:       `Flat ${String.fromCharCode(65 + i)}`,
      unit_type:         bedroomMix === "mixed" ? "residential_unknown" : resType,
      bedrooms:          bedroomMix === "mixed" ? null : resBeds,
      furnishing_status: "unfurnished",
    }),
  )

  return [...retailUnits, ...residentialUnits]
}

function m2(input: SkeletonInput): SkeletonUnit[] {
  const { unitCount = 2 } = input
  return Array.from({ length: unitCount }, (_, i) =>
    baseUnit({
      unit_number: `Unit ${i + 1}`,
      unit_type:   "commercial",
    }),
  )
}

function r6(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a, unitCount = 4 } = input
  const furnishing = safeFurnishing(a.furnished)
  return Array.from({ length: unitCount }, (_, i) =>
    baseUnit({
      unit_number:       `Room ${i + 1}`,
      unit_type:         "residential_student_room",
      bedrooms:          1,
      furnishing_status: furnishing,
    }),
  )
}

function r7(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a } = input
  const mix = (a.dwelling_mix as string[] | undefined) ?? ["main_house"]
  const UNIT_TYPE_MAP: Record<string, { type: string; label: string; lettable: boolean }> = {
    main_house:     { type: "residential_farmhouse", label: "Main house",     lettable: true  },
    cottage:        { type: "residential_cottage",   label: "Cottage",        lettable: true  },
    staff_quarters: { type: "residential_staff",     label: "Staff quarters", lettable: false },
    converted_barn: { type: "residential_loft",      label: "Converted barn", lettable: true  },
    rondavel:       { type: "residential_rondavel",  label: "Rondavel",       lettable: true  },
  }
  const units: SkeletonUnit[] = mix.flatMap((key) => {
    const meta = UNIT_TYPE_MAP[key]
    if (!meta) return []
    return [baseUnit({ unit_number: meta.label, unit_type: meta.type, is_lettable: meta.lettable })]
  })
  if (units.length === 0) {
    units.push(baseUnit({ unit_number: "Main house", unit_type: "residential_farmhouse", is_lettable: true }))
  }
  return units
}

function c5(input: SkeletonInput): SkeletonUnit[] {
  const { propertyName, scenarioAnswers: a } = input
  return [
    baseUnit({
      unit_number: propertyName,
      unit_type:   "commercial_retail",
      size_m2:     a.shopfront_m2 != null ? Number(a.shopfront_m2) : null,
    }),
  ]
}

function c6(input: SkeletonInput): SkeletonUnit[] {
  const { unitCount = 30 } = input
  return Array.from({ length: unitCount }, (_, i) =>
    baseUnit({
      unit_number: `Unit ${String(i + 1).padStart(3, "0")}`,
      unit_type:   "commercial_storage",
    }),
  )
}

const BEDROOM_MIX_TYPE: Record<string, string> = {
  studio: "residential_studio",
  "1bed": "residential_1bed",
  "2bed": "residential_2bed",
}
const BEDROOM_MIX_COUNT: Record<string, number> = {
  studio: 0, "1bed": 1, "2bed": 2,
}

function m3(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a } = input
  const officeCount      = Math.max(1, Number(a.office_unit_count      ?? 1))
  const residentialCount = Math.max(1, Number(a.residential_unit_count ?? 1))
  const bedroomMix       = String(a.residential_bedroom_mix ?? "1bed")
  const resType  = BEDROOM_MIX_TYPE[bedroomMix]  ?? "residential_unknown"
  const resBeds  = BEDROOM_MIX_COUNT[bedroomMix] ?? null

  const offices = Array.from({ length: officeCount }, (_, i) =>
    baseUnit({ unit_number: `Office ${i + 1}`, unit_type: "commercial_office" }),
  )
  const flats = Array.from({ length: residentialCount }, (_, i) =>
    baseUnit({
      unit_number: `Flat ${String.fromCharCode(65 + i)}`,
      unit_type:   bedroomMix === "mixed" ? "residential_unknown" : resType,
      bedrooms:    bedroomMix === "mixed" ? null : resBeds,
    }),
  )
  return [...offices, ...flats]
}

function m4(input: SkeletonInput): SkeletonUnit[] {
  const { scenarioAnswers: a } = input
  const guestCount = Math.max(0, Number(a.guest_room_count     ?? 0))
  const longCount  = Math.max(1, Number(a.long_stay_unit_count ?? 1))
  const guests = Array.from({ length: guestCount }, (_, i) =>
    baseUnit({ unit_number: `Guest room ${i + 1}`, unit_type: "hospitality_guest_room", is_lettable: false }),
  )
  const longStay = Array.from({ length: longCount }, (_, i) =>
    baseUnit({ unit_number: `Long-stay unit ${i + 1}`, unit_type: "hospitality_long_stay" }),
  )
  return [...guests, ...longStay]
}

function other(input: SkeletonInput): SkeletonUnit[] {
  const { propertyName } = input
  return [
    baseUnit({
      unit_number:       propertyName,
      unit_type:         null,
      furnishing_status: "unfurnished",
    }),
  ]
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

type Generator = (input: SkeletonInput) => SkeletonUnit[]

const GENERATORS: Record<ScenarioType, Generator> = {
  r1, r2, r3, r4, r5, r6, r7,
  c1, c2, c3, c4, c5, c6,
  m1, m2, m3, m4,
  other,
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate skeleton units for the given scenario + answers.
 * Always returns ≥1 unit.
 */
export function buildSkeletonUnits(input: SkeletonInput): SkeletonUnit[] {
  const generator = GENERATORS[input.scenarioType]
  const units     = generator(input)
  // Safety: guarantee at least 1 lettable unit
  if (units.length === 0) {
    return [baseUnit({ unit_number: input.propertyName })]
  }
  const hasLettable = units.some((u) => u.is_lettable)
  if (!hasLettable) {
    return [...units, baseUnit({ unit_number: `${input.propertyName} (unit)` })]
  }
  return units
}
