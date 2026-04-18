/**
 * lib/properties/scenarios.ts
 *
 * Scenario definitions for the smart property setup wizard (BUILD_60).
 * 17 SA property scenarios across 3 segments, plus an "other" escape hatch.
 *
 * Pure data — no side effects. Consumed by:
 *   - ScenarioPicker (wizard UI)
 *   - buildProfile (derive property_profile JSONB)
 *   - skeletonUnits (generate unit skeletons)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScenarioType =
  | "r1" | "r2" | "r3" | "r4" | "r5" | "r6" | "r7"
  | "c1" | "c2" | "c3" | "c4" | "c5" | "c6"
  | "m1" | "m2" | "m3" | "m4"
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

  r7: {
    code:             "r7",
    segment:          "residential",
    label:            "Farm or smallholding",
    tagline:          "Rural property — main house, cottages, and land.",
    icon:             "Trees",
    unitCountMode:    "counted",
    defaultUnitCount: 2,
    questions: [
      {
        id:       "dwelling_mix",
        group:    "unit_details",
        label:    "Dwellings on the property",
        helpText: "Each dwelling becomes its own unit record for inspections and leases.",
        type:     "multiselect",
        required: false,
        options: [
          { value: "main_house",     label: "Main house / farmhouse" },
          { value: "cottage",        label: "Cottage(s)" },
          { value: "staff_quarters", label: "Staff quarters" },
          { value: "converted_barn", label: "Converted barn / loft" },
          { value: "rondavel",       label: "Rondavel / outbuilding dwelling" },
        ],
      },
      {
        id:       "property_size",
        group:    "property_level",
        label:    "Property size",
        type:     "radio",
        required: false,
        options: [
          { value: "lt_1ha",  label: "Under 1 hectare (large stand)" },
          { value: "1_5ha",   label: "1–5 hectares (smallholding)" },
          { value: "5_21ha",  label: "5–21 hectares (agricultural holding)" },
          { value: "gt_21ha", label: "Over 21 hectares (farm)" },
        ],
      },
      {
        id:       "zoning",
        group:    "property_level",
        label:    "Zoning",
        helpText: "Affects rates, insurance, and permitted activities.",
        type:     "radio",
        required: false,
        options: [
          { value: "residential_agricultural", label: "Residential with agricultural rights" },
          { value: "agricultural",             label: "Agricultural" },
          { value: "residential_only",         label: "Residential only" },
          { value: "unsure",                   label: "Unsure — check title deed" },
        ],
      },
      {
        id:       "agricultural_activity",
        group:    "property_level",
        label:    "Agricultural activity",
        type:     "multiselect",
        required: false,
        options: [
          { value: "none_lifestyle",     label: "None — lifestyle only" },
          { value: "crops",              label: "Crops" },
          { value: "livestock",          label: "Livestock" },
          { value: "horses_equestrian",  label: "Horses / equestrian" },
          { value: "poultry",            label: "Poultry" },
          { value: "commercial_farming", label: "Commercial farming" },
          { value: "hunting_game",       label: "Hunting / game" },
        ],
      },
      {
        id:       "water_source",
        group:    "operational",
        label:    "Water source",
        type:     "multiselect",
        required: false,
        options: [
          { value: "municipal",       label: "Municipal" },
          { value: "borehole",        label: "Borehole" },
          { value: "rainwater_tanks", label: "Rainwater / JoJo tanks" },
          { value: "river_dam",       label: "River / dam" },
          { value: "shared_supply",   label: "Shared supply" },
        ],
      },
      {
        id:       "power_source",
        group:    "operational",
        label:    "Power source",
        type:     "multiselect",
        required: false,
        options: [
          { value: "eskom",         label: "Eskom grid" },
          { value: "solar",         label: "Solar" },
          { value: "generator",     label: "Generator" },
          { value: "off_grid",      label: "Fully off-grid" },
          { value: "shared_supply", label: "Shared supply" },
        ],
      },
      {
        id:       "sanitation",
        group:    "operational",
        label:    "Sanitation",
        type:     "radio",
        required: false,
        options: [
          { value: "municipal_sewer",  label: "Municipal sewer" },
          { value: "septic",           label: "Septic tank" },
          { value: "conservancy_tank", label: "Conservancy tank" },
          { value: "french_drain",     label: "French drain" },
        ],
      },
      {
        id:       "access",
        group:    "operational",
        label:    "Road access",
        type:     "radio",
        required: false,
        options: [
          { value: "public_road",         label: "Public tarred road" },
          { value: "private_road_shared", label: "Private road — shared" },
          { value: "private_road_own",    label: "Private road — own" },
          { value: "gated_estate_agri",   label: "Within a gated agricultural estate" },
        ],
      },
      {
        id:       "esta_applicable",
        group:    "property_level",
        label:    "ESTA may apply to occupiers",
        helpText: "Extension of Security of Tenure Act — usually applies to occupiers on land >1ha who've lived there 10+ years.",
        type:     "toggle",
        required: false,
      },
    ],
  },

  r6: {
    code:             "r6",
    segment:          "residential",
    label:            "Student housing / shared house",
    tagline:          "Rooms let individually in one house — shared kitchen and bathrooms.",
    icon:             "Users",
    unitCountMode:    "counted",
    defaultUnitCount: 4,
    questions: [
      {
        id:          "institution_nearby",
        group:       "property_level",
        label:       "Nearest institution",
        helpText:    "Drives NSFAS and academic-calendar defaults.",
        type:        "text",
        required:    false,
        placeholder: "e.g. Stellenbosch University, TUT Pretoria",
      },
      {
        id:       "lease_cycle",
        group:    "property_level",
        label:    "Typical lease cycle",
        type:     "radio",
        required: false,
        options: [
          { value: "academic_year_10m", label: "Academic year (10 months)" },
          { value: "academic_year_11m", label: "Academic year (11 months)" },
          { value: "calendar_year",     label: "Calendar year (12 months)" },
        ],
      },
      {
        id:       "nsfas_accredited",
        group:    "property_level",
        label:    "NSFAS-accredited",
        helpText: "Enables NSFAS-compatible invoicing and clause defaults.",
        type:     "toggle",
        required: false,
      },
      {
        id:       "bathroom_sharing",
        group:    "unit_details",
        label:    "Bathroom arrangement",
        type:     "radio",
        required: false,
        options: [
          { value: "shared_all",    label: "All bathrooms shared" },
          { value: "shared_some",   label: "Some shared, some en-suite" },
          { value: "en_suite_each", label: "En-suite per room" },
        ],
      },
      {
        id:       "meals_included",
        group:    "operational",
        label:    "Meals included in rent?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "utilities_in_rent",
        group:    "operational",
        label:    "Utilities bundled into rent?",
        helpText: "Typical for student housing — water, electricity, WiFi included.",
        type:     "toggle",
        required: false,
      },
      {
        id:       "furnished",
        group:    "unit_details",
        label:    "Room furnishing",
        type:     "radio",
        required: false,
        options: [
          { value: "unfurnished",    label: "Unfurnished" },
          { value: "semi_furnished", label: "Bed + desk provided" },
          { value: "furnished",      label: "Fully furnished" },
        ],
      },
      {
        id:       "key_deposit_enabled",
        group:    "operational",
        label:    "Key / access deposit required?",
        type:     "toggle",
        required: false,
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

  c5: {
    code:             "c5",
    segment:          "commercial_industrial",
    label:            "Standalone retail / shopfront",
    tagline:          "Single shop, salon, restaurant or showroom — ground-level trading space.",
    icon:             "Store",
    unitCountMode:    "fixed",
    defaultUnitCount: 1,
    questions: [
      {
        id:          "shopfront_m2",
        group:       "unit_details",
        label:       "Lettable trading area (m²)",
        type:        "number",
        required:    false,
        min:         1,
        placeholder: "80",
      },
      {
        id:       "trading_use",
        group:    "unit_details",
        label:    "Trading use",
        type:     "radio",
        required: false,
        options: [
          { value: "retail",       label: "Retail / shop" },
          { value: "restaurant",   label: "Restaurant / food" },
          { value: "salon_health", label: "Salon / health / wellness" },
          { value: "showroom",     label: "Showroom" },
          { value: "other",        label: "Other trading use" },
        ],
      },
      {
        id:       "liquor_licence_held",
        group:    "property_level",
        label:    "Liquor licence held?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "extractor_vent_installed",
        group:    "unit_details",
        label:    "Extractor vent / fume hood installed?",
        helpText: "Required for restaurants and food prep — landlord obligation.",
        type:     "toggle",
        required: false,
        showWhen: { questionId: "trading_use", value: "restaurant" },
      },
      {
        id:       "shopfront_signage_rights",
        group:    "property_level",
        label:    "Shopfront signage rights",
        type:     "radio",
        required: false,
        options: [
          { value: "full",      label: "Full — tenant designs their signage" },
          { value: "regulated", label: "Regulated by landlord / scheme" },
          { value: "none",      label: "No external signage permitted" },
        ],
      },
      {
        id:       "walk_in_customer_frontage",
        group:    "property_level",
        label:    "Customer frontage",
        type:     "radio",
        required: false,
        options: [
          { value: "street", label: "Street-facing" },
          { value: "mall",   label: "Inside a mall / centre" },
          { value: "arcade", label: "Arcade or passage" },
        ],
      },
      PARKING_BAYS_QUESTION,
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
    ],
  },

  c6: {
    code:             "c6",
    segment:          "commercial_industrial",
    label:            "Self-storage facility",
    tagline:          "Many small lockable storage units rented short-term.",
    icon:             "Package",
    unitCountMode:    "counted",
    defaultUnitCount: 30,
    questions: [
      {
        id:       "unit_size_mix",
        group:    "unit_details",
        label:    "Unit sizes offered",
        type:     "multiselect",
        required: false,
        options: [
          { value: "sub_5m2",  label: "Under 5 m² (lockers / small)" },
          { value: "5_10m2",   label: "5–10 m²" },
          { value: "10_20m2",  label: "10–20 m²" },
          { value: "20_50m2",  label: "20–50 m²" },
          { value: "gt_50m2",  label: "Over 50 m² (large / vehicle)" },
        ],
      },
      {
        id:       "access_model",
        group:    "operational",
        label:    "Tenant access",
        type:     "radio",
        required: false,
        options: [
          { value: "24_7_code",              label: "24/7 code or biometric access" },
          { value: "business_hours_staffed", label: "Business hours only, staffed" },
          { value: "appointment_only",       label: "By appointment" },
        ],
      },
      {
        id:       "climate_controlled_units",
        group:    "unit_details",
        label:    "Climate-controlled units available?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "vehicle_storage_permitted",
        group:    "unit_details",
        label:    "Vehicle storage permitted?",
        type:     "toggle",
        required: false,
      },
      {
        id:          "drive_up_units_count",
        group:       "unit_details",
        label:       "Drive-up accessible units",
        type:        "number",
        required:    false,
        min:         0,
        placeholder: "10",
      },
      {
        id:       "typical_lease_duration",
        group:    "property_level",
        label:    "Typical lease duration",
        helpText: "Self-storage usually runs month-to-month.",
        type:     "radio",
        required: false,
        options: [
          { value: "month_to_month", label: "Month-to-month" },
          { value: "3_month_min",    label: "3-month minimum" },
          { value: "6_month_min",    label: "6-month minimum" },
        ],
      },
      {
        id:       "prohibited_goods_clause_strict",
        group:    "operational",
        label:    "Strict prohibited-goods clause?",
        helpText: "Required when storing near food, chemicals, or flammables. Enables the enhanced prohibited-goods clause.",
        type:     "toggle",
        required: false,
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

  m3: {
    code:             "m3",
    segment:          "mixed",
    label:            "Office + residential mixed",
    tagline:          "Professional offices below, residential units above.",
    icon:             "Building2",
    unitCountMode:    "counted",
    defaultUnitCount: 4,
    questions: [
      {
        id:          "office_unit_count",
        group:       "unit_details",
        label:       "Office units",
        type:        "number",
        required:    false,
        min:         1,
        placeholder: "2",
      },
      {
        id:          "residential_unit_count",
        group:       "unit_details",
        label:       "Residential units",
        type:        "number",
        required:    false,
        min:         1,
        placeholder: "2",
      },
      {
        id:          "office_size_m2",
        group:       "unit_details",
        label:       "Average office unit size (m²)",
        type:        "number",
        required:    false,
        min:         1,
        placeholder: "120",
      },
      {
        id:       "residential_bedroom_mix",
        group:    "unit_details",
        label:    "Residential units — typical layout",
        helpText: "Applied to all residential skeletons. You can adjust each unit after creation.",
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
        label:    "Office and residential have separate entrances?",
        type:     "toggle",
        required: false,
      },
      {
        id:       "parking_model",
        group:    "property_level",
        label:    "Parking model",
        type:     "radio",
        required: false,
        options: [
          { value: "shared",    label: "Shared pool" },
          { value: "split",     label: "Split between uses" },
          { value: "allocated", label: "Allocated per tenant" },
        ],
      },
    ],
  },

  m4: {
    code:             "m4",
    segment:          "mixed",
    label:            "Guesthouse or B&B",
    tagline:          "Owner-run property with guest rooms and long-stay units.",
    icon:             "BedDouble",
    unitCountMode:    "counted",
    defaultUnitCount: 2,
    questions: [
      {
        id:       "owner_resides_onsite",
        group:    "property_level",
        label:    "Does the owner live on-site?",
        type:     "toggle",
        required: false,
      },
      {
        id:          "guest_room_count",
        group:       "unit_details",
        label:       "Guest rooms (short-stay)",
        helpText:    "Rooms rented nightly to guests — tracked for compliance, not leased through Pleks.",
        type:        "number",
        required:    false,
        min:         0,
        placeholder: "6",
      },
      {
        id:          "long_stay_unit_count",
        group:       "unit_details",
        label:       "Long-stay units (monthly+)",
        helpText:    "These get real leases — staff quarters, on-site manager, extended-stay tenants.",
        type:        "number",
        required:    false,
        min:         0,
        placeholder: "1",
      },
      {
        id:       "grading_council_stars",
        group:    "property_level",
        label:    "TGCSA grading",
        type:     "radio",
        required: false,
        options: [
          { value: "ungraded", label: "Ungraded" },
          { value: "1",        label: "1 star" },
          { value: "2",        label: "2 stars" },
          { value: "3",        label: "3 stars" },
          { value: "4",        label: "4 stars" },
          { value: "5",        label: "5 stars" },
        ],
      },
      {
        id:       "licences_held",
        group:    "operational",
        label:    "Licences and certificates held",
        type:     "multiselect",
        required: false,
        options: [
          { value: "business_licence", label: "Business licence" },
          { value: "liquor_licence",   label: "Liquor licence" },
          { value: "food_handling",    label: "Food handling / health" },
          { value: "fire_compliance",  label: "Fire compliance certificate" },
        ],
      },
      {
        id:       "parking_on_site",
        group:    "property_level",
        label:    "On-site guest parking?",
        type:     "toggle",
        required: false,
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
