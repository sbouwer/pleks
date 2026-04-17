/**
 * lib/properties/buildProfile.ts
 *
 * Pure function that derives the property_profile JSONB from wizard answers.
 * No DB access, no side effects — safe to call in tests and server actions.
 *
 * Consumed by: createPropertyFromWizard server action, reclassifyProperty action.
 */

import { SCENARIOS, type ScenarioType } from "./scenarios"

// ── Input types ───────────────────────────────────────────────────────────────

export interface UniversalAnswers {
  wifiAvailable:      "yes" | "no" | "unknown"
  cellSignalQuality:  "good" | "patchy" | "none" | "unknown"
  backupPower:        "none" | "ups" | "inverter" | "solar" | "generator" | "multiple"
  hasManagingScheme:  boolean
  schemeType:         string | null
  schemeName:         string | null
}

export interface BuildProfileInput {
  scenarioType:          ScenarioType
  managedMode:           "self_owned" | "managed_for_owner"
  universals:            UniversalAnswers
  scenarioAnswers:       Record<string, unknown>
  operatingHoursPreset?: string | null
  afterHoursAccess?:     string | null
}

// ── Output type (matches §9 spec) ─────────────────────────────────────────────

export interface ProfileDefaults {
  unit_type:                    string
  furnishing_status:            string | null
  insurance_type:               string
  insurance_rider:              string | null
  cpa_applicable:               boolean
  default_deposit_months:       number
  default_lease_duration_months: number
  inspection_profile_key:       string
  clause_profile_key:           string
  welcome_pack_template:        string
}

export interface PropertyProfile {
  scenario_type:          ScenarioType
  scenario_label:         string
  managed_mode:           "self_owned" | "managed_for_owner"
  universals: {
    wifi_available:       string
    cell_signal:          string
    backup_power:         string
    has_managing_scheme:  boolean
    scheme_type:          string | null
    scheme_name:          string | null
  }
  scenario_answers:       Record<string, unknown>
  operating_hours_preset: string | null
  after_hours_access:     string | null
  defaults:               ProfileDefaults
  created_at:             string
  version:                1
}

// ── Lookup tables (avoid long if/else chains for ESLint compliance) ───────────

/** Which insurance type to default to per scenario */
const INSURANCE_TYPE_BY_SCENARIO: Record<ScenarioType, string> = {
  r1: "standard_buildings",
  r2: "standard_buildings",
  r3: "sectional_title",
  r4: "standard_buildings",
  r5: "standard_buildings",
  c1: "commercial_property",
  c2: "commercial_property",
  c3: "commercial_property",
  c4: "commercial_property",
  m1: "commercial_property",
  m2: "commercial_property",
  other: "standard_buildings",
}

/** Insurance rider based on business_use answer */
const INSURANCE_RIDER_BY_USE: Record<string, string> = {
  home_office_only:     "sublet_home_office",
  practice_consultancy: "practice_liability",
  commercial_activity:  "commercial_rider",
}

/** CPA applicable per scenario segment */
const CPA_BY_SCENARIO: Record<ScenarioType, boolean> = {
  r1: true, r2: true, r3: true, r4: true, r5: true,
  c1: false, c2: false, c3: false, c4: false,
  m1: true,  // mixed — residential units trigger CPA, commercial don't; default true (conservative)
  m2: true,
  other: true,
}

/** Default lease duration (months) */
const LEASE_DURATION_BY_SCENARIO: Record<ScenarioType, number> = {
  r1: 12, r2: 12, r3: 12, r4: 12, r5: 12,
  c1: 24, c2: 24, c3: 24, c4: 24,
  m1: 12, m2: 12,
  other: 12,
}

/** Deposit months by furnishing status (§9.2) */
const DEPOSIT_MONTHS_BY_FURNISHING: Record<string, number> = {
  unfurnished:   1,
  semi_furnished: 1.5,
  furnished:     2,
}

// ── Derivation helpers ────────────────────────────────────────────────────────

/** Maps bedroom count to a residential unit type string */
function bedsToUnitType(beds: number): string {
  if (beds === 0) return "residential_studio"
  if (beds >= 3)  return "residential_3bed"
  return `residential_${beds}bed`
}

/** Maps flatlet_type answer to unit type */
function flatletToUnitType(flatletType: string): string {
  const map: Record<string, string> = {
    studio: "residential_studio",
    "1bed": "residential_1bed",
    "2bed": "residential_2bed",
  }
  return map[flatletType] ?? "residential_1bed"
}

/** Fixed unit type for scenarios that don't need answer inspection */
const FIXED_UNIT_TYPE: Partial<Record<ScenarioType, string>> = {
  r2: "residential_house",
  r5: "residential_unknown",
  c3: "industrial_warehouse",
  c4: "commercial",
  m1: "commercial_retail",
  m2: "commercial",
}

function deriveUnitType(
  scenario: ScenarioType,
  answers: Record<string, unknown>,
): string {
  if (scenario in FIXED_UNIT_TYPE) return FIXED_UNIT_TYPE[scenario]!

  if (scenario === "r1") {
    return flatletToUnitType(String(answers.flatlet_type ?? "1bed"))
  }
  if (scenario === "r3") {
    return bedsToUnitType(Number(answers.bedrooms ?? 1))
  }
  if (scenario === "r4") {
    if (answers.identical_layout !== true) return "residential_unknown"
    return bedsToUnitType(Number(answers.bedrooms_default ?? 1))
  }
  if (scenario === "c1") {
    const use = String(answers.use_type ?? "office")
    if (use === "retail" || use === "restaurant") return "commercial_retail"
    return "commercial_office"
  }
  if (scenario === "c2") {
    const mix = String(answers.mix_type ?? "mixed")
    if (mix === "all_retail") return "commercial_retail"
    if (mix === "all_office") return "commercial_office"
    return "commercial"
  }
  return "residential_unknown"
}

function deriveFurnishingStatus(
  scenario: ScenarioType,
  answers: Record<string, unknown>,
): string | null {
  const residential = ["r1", "r2", "r3", "r4", "r5"]
  if (!residential.includes(scenario)) return null

  if (scenario === "r1") return String(answers.furnished ?? "unfurnished")
  if (scenario === "r4") {
    if (answers.identical_layout === true && answers.furnishing_default) {
      return String(answers.furnishing_default)
    }
  }
  return "unfurnished"
}

function deriveInsuranceRider(
  scenario: ScenarioType,
  answers: Record<string, unknown>,
): string | null {
  const residentialWithBusinessUse = ["r1", "r2", "r3"]
  if (!residentialWithBusinessUse.includes(scenario)) return null
  const use = String(answers.business_use ?? "not_permitted")
  return INSURANCE_RIDER_BY_USE[use] ?? null
}

function deriveDepositMonths(furnishing: string | null): number {
  if (!furnishing) return 2  // commercial default
  return DEPOSIT_MONTHS_BY_FURNISHING[furnishing] ?? 1
}

function deriveInspectionProfileKey(
  scenario: ScenarioType,
  answers: Record<string, unknown>,
): string {
  if (scenario === "r1") {
    const ft = String(answers.flatlet_type ?? "1bed")
    return `residential_${ft}_flatlet`
  }
  const profileKeys: Partial<Record<ScenarioType, string>> = {
    r2:    "residential_house",
    r3:    "residential_apartment",
    r4:    "residential_block",
    r5:    "residential_estate",
    c3:    "industrial_warehouse",
    c4:    "commercial_park",
    m1:    "mixed_retail_residential",
    m2:    "mixed_development",
    other: "generic",
  }
  if (profileKeys[scenario]) return profileKeys[scenario]!
  if (scenario === "c1") {
    const use = String(answers.use_type ?? "office")
    if (use === "retail" || use === "restaurant") return "commercial_retail"
    return "commercial_office"
  }
  if (scenario === "c2") return "commercial_multitenanted"
  return "generic"
}

function deriveClauseProfileKey(
  scenario: ScenarioType,
  managedMode: "self_owned" | "managed_for_owner",
  answers: Record<string, unknown>,
): string {
  if (scenario === "r1") {
    const use     = String(answers.business_use ?? "not_permitted")
    const managed = managedMode === "managed_for_owner" ? "managed" : "self_managed"
    if (use === "not_permitted") return `residential_${managed}_standard`
    return `residential_${managed}_home_office`
  }
  if (scenario === "r2") {
    const use = String(answers.business_use ?? "not_permitted")
    return use === "not_permitted" ? "residential_standard" : "residential_home_office"
  }
  const clauseKeys: Partial<Record<ScenarioType, string>> = {
    r3:    "residential_sectional_title",
    r4:    "residential_block",
    r5:    "residential_estate",
    c1:    "commercial_single_tenant",
    c2:    "commercial_multi_tenant",
    c3:    "commercial_industrial",
    c4:    "commercial_park",
    m1:    "mixed_use",
    m2:    "mixed_use",
    other: "generic",
  }
  return clauseKeys[scenario] ?? "residential_standard"
}

function deriveWelcomePackTemplate(
  scenario: ScenarioType,
  managedMode: "self_owned" | "managed_for_owner",
): string {
  if (scenario === "r1") {
    return managedMode === "managed_for_owner"
      ? "residential_managed_flatlet"
      : "residential_self_managed_flatlet"
  }
  const templates: Partial<Record<ScenarioType, string>> = {
    r2:    "residential_rental_house",
    r3:    "residential_sectional_title",
    r4:    "residential_block_unit",
    r5:    "residential_estate_unit",
    c1:    "commercial_single",
    c2:    "commercial_multi",
    c3:    "industrial_warehouse",
    c4:    "commercial_park",
    m1:    "mixed_retail",
    m2:    "mixed_development",
    other: "generic",
  }
  return templates[scenario] ?? "generic"
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildProfile(input: BuildProfileInput): PropertyProfile {
  const {
    scenarioType,
    managedMode,
    universals,
    scenarioAnswers,
    operatingHoursPreset = null,
    afterHoursAccess     = null,
  } = input

  const scenarioLabel =
    scenarioType === "other"
      ? "Other / advanced"
      : (SCENARIOS[scenarioType]?.label ?? scenarioType)

  const furnishing   = deriveFurnishingStatus(scenarioType, scenarioAnswers)
  const unitType     = deriveUnitType(scenarioType, scenarioAnswers)
  const rider        = deriveInsuranceRider(scenarioType, scenarioAnswers)
  const depositMo    = deriveDepositMonths(furnishing)

  const defaults: ProfileDefaults = {
    unit_type:                    unitType,
    furnishing_status:            furnishing,
    insurance_type:               INSURANCE_TYPE_BY_SCENARIO[scenarioType],
    insurance_rider:              rider,
    cpa_applicable:               CPA_BY_SCENARIO[scenarioType],
    default_deposit_months:       depositMo,
    default_lease_duration_months: LEASE_DURATION_BY_SCENARIO[scenarioType],
    inspection_profile_key:       deriveInspectionProfileKey(scenarioType, scenarioAnswers),
    clause_profile_key:           deriveClauseProfileKey(scenarioType, managedMode, scenarioAnswers),
    welcome_pack_template:        deriveWelcomePackTemplate(scenarioType, managedMode),
  }

  return {
    scenario_type:          scenarioType,
    scenario_label:         scenarioLabel,
    managed_mode:           managedMode,
    universals: {
      wifi_available:       universals.wifiAvailable,
      cell_signal:          universals.cellSignalQuality,
      backup_power:         universals.backupPower,
      has_managing_scheme:  universals.hasManagingScheme,
      scheme_type:          universals.schemeType,
      scheme_name:          universals.schemeName,
    },
    scenario_answers:       scenarioAnswers,
    operating_hours_preset: operatingHoursPreset ?? null,
    after_hours_access:     afterHoursAccess ?? null,
    defaults,
    created_at:             new Date().toISOString(),
    version:                1,
  }
}
