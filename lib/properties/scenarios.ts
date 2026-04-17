/**
 * lib/properties/scenarios.ts
 *
 * Scenario definitions for the smart property setup wizard (BUILD_60).
 * 11 SA property scenarios across 3 segments, plus an "other" escape hatch.
 *
 * Pure data — no side effects. Consumed by:
 *   - ScenarioPicker (wizard UI)
 *   - buildProfile (derive property_profile JSONB)
 *   - skeletonUnits (generate unit skeletons)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScenarioType =
  | "r1" | "r2" | "r3" | "r4" | "r5"
  | "c1" | "c2" | "c3" | "c4"
  | "m1" | "m2"
  | "other"

export type ScenarioSegment = "residential" | "commercial_industrial" | "mixed"

export type QuestionType = "radio" | "select" | "number" | "text" | "toggle" | "multiselect"

export type QuestionGroup = "unit_details" | "property_level" | "operational"

export interface QuestionOption {
  value: string
  label: string
}

export interface ScenarioQuestion {
  id:           string
  group:        QuestionGroup
  label:        string
  helpText?:    string
  type:         QuestionType
  options?:     QuestionOption[]
  required:     boolean
  /** Show only when another question's answer matches */
  showWhen?:    { questionId: string; value: unknown }
  min?:         number
  max?:         number
  placeholder?: string
}

export interface ScenarioMeta {
  code:              ScenarioType
  segment:           ScenarioSegment
  label:             string
  tagline:           string
  /** Lucide icon component name */
  icon:              string
  /** "fixed" = count known by scenario; "counted" = user enters count on card */
  unitCountMode:     "fixed" | "counted"
  defaultUnitCount:  number
  /** If set, pre-selects this scheme type and skips the universal BC question */
  preselectSchemeType?: string
  questions:         ScenarioQuestion[]
}

// ── Shared question fragments ─────────────────────────────────────────────────

const BUSINESS_USE_QUESTION: ScenarioQuestion = {
  id:       "business_use",
  group:    "property_level",
  label:    "Business use",
  helpText: "Determines the lease clause profile and insurance rider.",
  type:     "radio",
  required: false,
  options: [
    { value: "not_permitted",          label: "Not permitted" },
    { value: "home_office_only",       label: "Home office only" },
    { value: "practice_consultancy",   label: "Practice / consultancy" },
    { value: "commercial_activity",    label: "Commercial activity" },
  ],
}

const PARKING_BAYS_QUESTION: ScenarioQuestion = {
  id:          "parking_bays",
  group:       "unit_details",
  label:       "Parking bays",
  type:        "number",
  required:    false,
  min:         0,
  max:         100,
  placeholder: "0",
}

// ── Scenario definitions ──────────────────────────────────────────────────────

export const SCENARIOS: Record<Exclude<ScenarioType, "other">, ScenarioMeta> = {

  // ── Residential ─────────────────────────────────────────────────────────────

  r1: {
    code:             "r1",
    segment:          "residential",
    label:            "Flatlet or cottage",
    tagline:          "You live on the property and let out part of it.",
    icon:             "Home",
    unitCountMode:    "fixed",
    defaultUnitCount: 2,
    questions: [
      {
        id:       "flatlet_type",
        group:    "unit_details",
        label:    "Flatlet size",
        type:     "radio",
        required: true,
        options: [
          { value: "studio", label: "Studio (no bedroom)" },
          { value: "1bed",   label: "1 bedroom" },
          { value: "2bed",   label: "2+ bedrooms" },
        ],
      },
      {
        id:       "furnished",
        group:    "unit_details",
        label:    "Furnishing status",
        type:     "radio",
        required: true,
        options: [
          { value: "unfurnished",   label: "Unfurnished" },
          { value: "semi_furnished", label: "Partly furnished" },
          { value: "furnished",     label: "Fully furnished" },
        ],
      },
      {
        id:       "own_entrance",
        group:    "unit_details",
        label:    "Does the flatlet have its own entrance?",
        type:     "toggle",
        required: false,
      },
      BUSINESS_USE_QUESTION,
      {
        id:          "flatlet_label",
        group:       "property_level",
        label:       "What would you like to call the flatlet?",
        helpText:    "This is the unit label visible to you and your tenant.",
        type:        "text",
        required:    false,
        placeholder: "Garden cottage",
      },
    ],
  },

  r2: {
    code:             "r2",
    segment:          "residential",
    label:            "Rental house",
    tagline:          "Freestanding house let as a whole to one tenant.",
    icon:             "House",
    unitCountMode:    "fixed",
    defaultUnitCount: 1,
    questions: [
      {
        id:          "bedrooms",
        group:       "unit_details",
        label:       "Bedrooms",
        type:        "number",
        required:    false,
        min:         1,
        max:         20,
        placeholder: "3",
      },
      {
        id:          "bathrooms",
        group:       "unit_details",
        label:       "Bathrooms",
        type:        "number",
        required:    false,
        min:         1,
        max:         10,
        placeholder: "2",
      },
      PARKING_BAYS_QUESTION,
      {
        id:       "has_pool",
        group:    "property_level",
        label:    "Does the property have a pool?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "has_garden_service",
        group:    "property_level",
        label:    "Is garden service included?",
        type:     "toggle",
        required: false,
      },
      BUSINESS_USE_QUESTION,
    ],
  },

  r3: {
    code:               "r3",
    segment:            "residential",
    label:              "Sectional title apartment",
    tagline:            "One flat in a scheme. The body corporate handles the building.",
    icon:               "Building2",
    unitCountMode:      "fixed",
    defaultUnitCount:   1,
    preselectSchemeType: "body_corporate",
    questions: [
      {
        id:          "bedrooms",
        group:       "unit_details",
        label:       "Bedrooms",
        type:        "number",
        required:    false,
        min:         0,
        max:         10,
        placeholder: "2",
      },
      {
        id:          "section_number",
        group:       "unit_details",
        label:       "Section number",
        helpText:    "The section number from your title deed.",
        type:        "text",
        required:    false,
        placeholder: "42",
      },
      {
        id:          "floor",
        group:       "unit_details",
        label:       "Floor",
        type:        "number",
        required:    false,
        min:         0,
        max:         100,
        placeholder: "3",
      },
      {
        id:       "parking_type",
        group:    "unit_details",
        label:    "Parking",
        type:     "radio",
        required: false,
        options: [
          { value: "none",       label: "No parking" },
          { value: "allocated",  label: "Allocated bay" },
          { value: "visitor",    label: "Visitor only" },
          { value: "basement",   label: "Underground / basement" },
        ],
      },
      {
        id:       "has_storage_room",
        group:    "unit_details",
        label:    "Includes a storage room / lock-up?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "pet_rules",
        group:    "property_level",
        label:    "Pets",
        helpText: "The body corporate rules usually govern this — check before selecting.",
        type:     "radio",
        required: false,
        options: [
          { value: "not_permitted",        label: "Not permitted" },
          { value: "permitted",            label: "Permitted" },
          { value: "subject_to_trustees",  label: "Subject to trustee approval" },
        ],
      },
      BUSINESS_USE_QUESTION,
    ],
  },

  r4: {
    code:             "r4",
    segment:          "residential",
    label:            "Block of units",
    tagline:          "You own the whole erf — duplex, flats, cottages.",
    icon:             "Buildings",
    unitCountMode:    "counted",
    defaultUnitCount: 2,
    questions: [
      {
        id:       "identical_layout",
        group:    "unit_details",
        label:    "Are all units the same layout?",
        type:     "toggle",
        required: false,
      },
      {
        id:          "bedrooms_default",
        group:       "unit_details",
        label:       "Bedrooms per unit",
        type:        "number",
        required:    false,
        min:         0,
        max:         10,
        placeholder: "2",
        showWhen:    { questionId: "identical_layout", value: true },
      },
      {
        id:       "furnishing_default",
        group:    "unit_details",
        label:    "Furnishing status",
        type:     "radio",
        required: false,
        showWhen: { questionId: "identical_layout", value: true },
        options: [
          { value: "unfurnished",    label: "Unfurnished" },
          { value: "semi_furnished", label: "Partly furnished" },
          { value: "furnished",      label: "Fully furnished" },
        ],
      },
      {
        id:       "shared_amenities",
        group:    "property_level",
        label:    "Shared amenities",
        type:     "multiselect",
        required: false,
        options: [
          { value: "pool",         label: "Pool" },
          { value: "laundry",      label: "Laundry room" },
          { value: "parking_area", label: "Parking area" },
          { value: "garden_braai", label: "Garden / braai area" },
          { value: "gym",          label: "Gym" },
        ],
      },
    ],
  },

  r5: {
    code:               "r5",
    segment:            "residential",
    label:              "Residential estate or complex",
    tagline:            "Multiple buildings on a managed estate.",
    icon:               "MapPin",
    unitCountMode:      "counted",
    defaultUnitCount:   4,
    preselectSchemeType: "hoa",
    questions: [
      {
        id:       "shared_infrastructure",
        group:    "property_level",
        label:    "Shared infrastructure",
        type:     "multiselect",
        required: false,
        options: [
          { value: "pool",             label: "Pool" },
          { value: "gym",              label: "Gym" },
          { value: "security_gatehouse", label: "Security gatehouse" },
          { value: "parking_deck",     label: "Parking deck" },
          { value: "cctv",             label: "CCTV" },
          { value: "backup_power",     label: "Estate backup power" },
          { value: "fibre",            label: "Estate fibre / telecoms" },
        ],
      },
      {
        id:       "compliance_scope",
        group:    "property_level",
        label:    "Managing scheme type",
        type:     "radio",
        required: false,
        options: [
          { value: "body_corporate", label: "Body corporate (STSMA)" },
          { value: "hoa",            label: "Homeowners association (HOA)" },
          { value: "both",           label: "Both" },
          { value: "other",          label: "Other scheme" },
        ],
      },
    ],
  },

  // ── Commercial / Industrial ──────────────────────────────────────────────────

  c1: {
    code:             "c1",
    segment:          "commercial_industrial",
    label:            "Single commercial tenant",
    tagline:          "One commercial or professional tenant occupying the whole space.",
    icon:             "Briefcase",
    unitCountMode:    "fixed",
    defaultUnitCount: 1,
    questions: [
      {
        id:          "size_m2",
        group:       "unit_details",
        label:       "Lettable area (m²)",
        type:        "number",
        required:    false,
        min:         1,
        placeholder: "150",
      },
      {
        id:       "use_type",
        group:    "unit_details",
        label:    "Primary use",
        type:     "select",
        required: false,
        options: [
          { value: "office",          label: "Office / professional" },
          { value: "retail",          label: "Retail / shop" },
          { value: "restaurant",      label: "Restaurant / food" },
          { value: "medical",         label: "Medical / dental / clinic" },
          { value: "place_of_worship", label: "Place of worship" },
          { value: "storage",         label: "Storage / mini-warehouse" },
          { value: "other",           label: "Other commercial use" },
        ],
      },
      {
        id:       "current_tenant_status",
        group:    "property_level",
        label:    "Current occupancy",
        type:     "radio",
        required: false,
        options: [
          { value: "vacant",   label: "Vacant" },
          { value: "tenanted", label: "Currently tenanted" },
        ],
      },
      PARKING_BAYS_QUESTION,
      {
        id:       "loading_access",
        group:    "property_level",
        label:    "Loading / delivery access?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "shopfront_signage",
        group:    "property_level",
        label:    "Shopfront signage permitted?",
        type:     "toggle",
        required: false,
      },
    ],
  },

  c2: {
    code:             "c2",
    segment:          "commercial_industrial",
    label:            "Multi-tenant commercial",
    tagline:          "Multiple commercial tenants in one building.",
    icon:             "Building",
    unitCountMode:    "counted",
    defaultUnitCount: 3,
    questions: [
      {
        id:       "mix_type",
        group:    "unit_details",
        label:    "Tenant mix",
        type:     "radio",
        required: false,
        options: [
          { value: "all_office",  label: "All office" },
          { value: "all_retail",  label: "All retail" },
          { value: "mixed",       label: "Mixed office + retail" },
        ],
      },
      {
        id:       "common_services",
        group:    "property_level",
        label:    "Common services",
        type:     "multiselect",
        required: false,
        options: [
          { value: "reception",   label: "Reception / lobby" },
          { value: "toilets",     label: "Shared toilets" },
          { value: "generator",   label: "Generator backup" },
          { value: "parking",     label: "Shared parking" },
          { value: "lifts",       label: "Lifts / elevators" },
          { value: "hvac",        label: "Central HVAC" },
        ],
      },
      {
        id:       "parking_model",
        group:    "property_level",
        label:    "Parking model",
        type:     "radio",
        required: false,
        options: [
          { value: "shared",     label: "Shared pool" },
          { value: "allocated",  label: "Allocated per tenant" },
          { value: "none",       label: "No parking" },
        ],
      },
      {
        id:       "is_part_of_scheme",
        group:    "property_level",
        label:    "Is this building part of a multi-owner scheme?",
        type:     "toggle",
        required: false,
      },
    ],
  },

  c3: {
    code:             "c3",
    segment:          "commercial_industrial",
    label:            "Light industrial / warehouse",
    tagline:          "Warehouse or factory units — roller doors, loading, power.",
    icon:             "Warehouse",
    unitCountMode:    "counted",
    defaultUnitCount: 1,
    questions: [
      {
        id:          "size_m2",
        group:       "unit_details",
        label:       "Unit size (m²)",
        type:        "number",
        required:    false,
        min:         1,
        placeholder: "500",
      },
      {
        id:          "roller_door_count",
        group:       "unit_details",
        label:       "Roller doors",
        type:        "number",
        required:    false,
        min:         0,
        placeholder: "1",
      },
      {
        id:       "loading_bay_type",
        group:    "unit_details",
        label:    "Loading bay type",
        type:     "radio",
        required: false,
        options: [
          { value: "none",       label: "None" },
          { value: "drive_in",   label: "Drive-in" },
          { value: "dock_level", label: "Dock-level" },
          { value: "mixed",      label: "Mixed" },
        ],
      },
      {
        id:       "three_phase_power",
        group:    "unit_details",
        label:    "Three-phase power available?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "floor_loading",
        group:    "unit_details",
        label:    "Floor loading capacity",
        type:     "radio",
        required: false,
        options: [
          { value: "standard",    label: "Standard (< 2t/m²)" },
          { value: "heavy",       label: "Heavy duty (2–5t/m²)" },
          { value: "heavy_plus",  label: "Extra heavy (> 5t/m²)" },
        ],
      },
      {
        id:       "clear_height_category",
        group:    "unit_details",
        label:    "Clear height",
        type:     "radio",
        required: false,
        options: [
          { value: "3_5m",    label: "Low (3–5 m)" },
          { value: "5_8m",    label: "Medium (5–8 m)" },
          { value: "8m_plus", label: "High (8 m+)" },
        ],
      },
      {
        id:       "office_component_pct",
        group:    "unit_details",
        label:    "Office component",
        type:     "radio",
        required: false,
        options: [
          { value: "none",   label: "None" },
          { value: "lt_10",  label: "Less than 10%" },
          { value: "10_25",  label: "10–25%" },
          { value: "gt_25",  label: "More than 25%" },
        ],
      },
      {
        id:       "has_crane",
        group:    "unit_details",
        label:    "Overhead crane installed?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "hazmat_approved",
        group:    "property_level",
        label:    "HAZMAT storage approved?",
        helpText: "Municipal permit required for certain chemicals, flammables, and hazardous goods.",
        type:     "toggle",
        required: false,
      },
      {
        id:       "rail_siding",
        group:    "property_level",
        label:    "Rail siding access?",
        type:     "toggle",
        required: false,
      },
    ],
  },

  c4: {
    code:             "c4",
    segment:          "commercial_industrial",
    label:            "Commercial park",
    tagline:          "Multiple buildings on a managed commercial estate.",
    icon:             "LayoutGrid",
    unitCountMode:    "counted",
    defaultUnitCount: 4,
    questions: [
      {
        id:       "park_amenities",
        group:    "property_level",
        label:    "Park amenities",
        type:     "multiselect",
        required: false,
        options: [
          { value: "guard_house",     label: "Guard house" },
          { value: "cctv",            label: "CCTV" },
          { value: "fibre",           label: "Fibre / telecoms duct" },
          { value: "generator",       label: "Generator backup" },
          { value: "loading_courts",  label: "Loading courts" },
          { value: "visitor_parking", label: "Visitor parking" },
          { value: "canteen",         label: "Canteen / café" },
        ],
      },
      {
        id:       "security_level",
        group:    "property_level",
        label:    "Security level",
        type:     "radio",
        required: false,
        options: [
          { value: "basic",           label: "Basic (fence + lock)" },
          { value: "controlled",      label: "Controlled access (boom / biometric)" },
          { value: "24h_manned",      label: "24-hour manned security" },
        ],
      },
    ],
  },

  // ── Mixed use ────────────────────────────────────────────────────────────────

  m1: {
    code:             "m1",
    segment:          "mixed",
    label:            "Retail + residential mixed",
    tagline:          "Ground floor retail with residential units above.",
    icon:             "Layers",
    unitCountMode:    "counted",
    defaultUnitCount: 4,
    questions: [
      {
        id:          "retail_size_m2",
        group:       "unit_details",
        label:       "Average retail unit size (m²)",
        type:        "number",
        required:    false,
        min:         1,
        placeholder: "80",
      },
      {
        id:       "residential_bedroom_mix",
        group:    "unit_details",
        label:    "Residential units — typical layout",
        helpText: "Applied to all residential skeletons. You can adjust individual units after creation.",
        type:     "radio",
        required: false,
        options: [
          { value: "studio", label: "Studio" },
          { value: "1bed",   label: "1 bedroom" },
          { value: "2bed",   label: "2 bedrooms" },
          { value: "mixed",  label: "Mixed layouts" },
        ],
      },
      {
        id:       "separate_entrances",
        group:    "property_level",
        label:    "Retail and residential have separate entrances?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "shared_services",
        group:    "property_level",
        label:    "Shared services",
        type:     "multiselect",
        required: false,
        options: [
          { value: "stairwell",     label: "Common stairwell" },
          { value: "parking",       label: "Shared parking" },
          { value: "refuse",        label: "Refuse area" },
          { value: "garden",        label: "Garden area" },
          { value: "utility_rooms", label: "Utility / meter rooms" },
        ],
      },
    ],
  },

  m2: {
    code:             "m2",
    segment:          "mixed",
    label:            "Mixed-use development",
    tagline:          "Multiple buildings with different commercial and residential uses.",
    icon:             "Network",
    unitCountMode:    "counted",
    defaultUnitCount: 2,
    questions: [
      {
        id:       "development_type_mix",
        group:    "unit_details",
        label:    "Development mix",
        type:     "multiselect",
        required: false,
        options: [
          { value: "office",      label: "Office / professional" },
          { value: "retail",      label: "Retail / commercial" },
          { value: "residential", label: "Residential" },
          { value: "industrial",  label: "Light industrial" },
          { value: "hospitality", label: "Hospitality / hotel" },
        ],
      },
      {
        id:       "shared_infrastructure",
        group:    "property_level",
        label:    "Shared infrastructure",
        type:     "multiselect",
        required: false,
        options: [
          { value: "guard_house",     label: "Guard house / access control" },
          { value: "cctv",            label: "CCTV" },
          { value: "fibre",           label: "Fibre / telecoms duct" },
          { value: "generator",       label: "Generator backup" },
          { value: "visitor_parking", label: "Visitor parking" },
          { value: "loading_courts",  label: "Loading courts" },
        ],
      },
    ],
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getScenario(code: ScenarioType): ScenarioMeta | null {
  if (code === "other") return null
  return SCENARIOS[code]
}

export function getSegmentScenarios(segment: ScenarioSegment): ScenarioMeta[] {
  return Object.values(SCENARIOS).filter((s) => s.segment === segment)
}

export const ALL_SEGMENTS: Array<{ value: ScenarioSegment; label: string }> = [
  { value: "residential",          label: "Residential" },
  { value: "commercial_industrial", label: "Commercial / Industrial" },
  { value: "mixed",                label: "Mixed use" },
]
