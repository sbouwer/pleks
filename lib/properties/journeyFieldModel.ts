/**
 * lib/properties/journeyFieldModel.ts — BUILD_69 Component D: durable / per-lease / straddle field SSOT
 *
 * Classifies the fields the lease journey collects across the 4+1 contact moments, each with its REQUIRED FLOOR
 * (gates that moment's value) vs OPTIONAL enrichment. Durable fields live on the unit/property and reuse every
 * lease (the compounding mechanic); per-lease fields are re-confirmed each time; straddle fields have a durable
 * default that's confirmed per lease. This is the single source the journey-completeness surface reads — so
 * "what's needed next" appears at each moment instead of dropping everything at signing.
 *
 * Columns are verified live (CC grounding 2026-06-11). Only ONE was net-new (§12.4 migration):
 *   • units.default_lease_period_months (the straddle default). The durable inspection room template already
 *     existed (unit_inspection_profiles + unit_inspection_profile_rooms, BUILD_57) — moment-5 reads it.
 * Divergence from the spec's Component-D table, flagged for CD: **clause/lease tailoring is PER-LEASE today**
 * (lease_clause_selections per lease_id) — there is no durable per-unit clause template. Making it durable would
 * be a further net-new (a per-unit clause set); until then it is correctly per-lease here.
 */

export type FieldClass = "durable" | "per_lease" | "straddle"
export type JourneyMoment = "creation" | "listing" | "acceptance" | "signing" | "ingoing"
export type FieldSource = "property" | "unit" | "listing" | "lease" | "application"
export type FieldBacking = "column" | "table"

export interface JourneyField {
  key: string
  label: string
  fieldClass: FieldClass
  moment: JourneyMoment
  required: boolean          // true = required floor (gates the moment) · false = optional enrichment
  source: FieldSource        // which entity carries it
  ref: string                // the live column, or backing table for `backing: "table"`
  backing: FieldBacking
}

export const JOURNEY_MOMENTS: { moment: JourneyMoment; trigger: string; unlocks: string }[] = [
  { moment: "creation",   trigger: "add property/unit",               unlocks: "property exists" },
  { moment: "listing",    trigger: "advertise vacant unit",           unlocks: "advert + the FitScore numerator" },
  { moment: "acceptance", trigger: "applicant applies / agent seeds",  unlocks: "FitScore + shortlist" },
  { moment: "signing",    trigger: "make / sign lease",               unlocks: "generate / tailor / sign" },
  { moment: "ingoing",    trigger: "post-activation",                 unlocks: "ingoing inspection = the deposit evidence chain" },
]

export const JOURNEY_FIELDS: JourneyField[] = [
  // ── Moment 1: creation ──────────────────────────────────────────────────────
  { key: "address",        label: "Property address",        fieldClass: "durable",   moment: "creation",   required: true,  source: "property",    ref: "address_line1",              backing: "column" },
  { key: "unit_identity",  label: "Unit identity",           fieldClass: "durable",   moment: "creation",   required: true,  source: "unit",        ref: "unit_number",                backing: "column" },
  { key: "unit_type",      label: "Unit type",               fieldClass: "durable",   moment: "creation",   required: false, source: "unit",        ref: "unit_type",                  backing: "column" },

  // ── Moment 2: listing ───────────────────────────────────────────────────────
  { key: "asking_rent",    label: "Asking rent",             fieldClass: "durable",   moment: "listing",    required: true,  source: "unit",        ref: "asking_rent_cents",          backing: "column" },
  { key: "furnishing",     label: "Furnishing",              fieldClass: "durable",   moment: "listing",    required: true,  source: "unit",        ref: "furnishing_status",          backing: "column" },
  { key: "lease_period",   label: "Lease period (default)",  fieldClass: "straddle",  moment: "listing",    required: true,  source: "unit",        ref: "default_lease_period_months", backing: "column" },

  // ── Moment 3: acceptance ────────────────────────────────────────────────────
  { key: "income",         label: "Applicant income",        fieldClass: "per_lease", moment: "acceptance", required: true,  source: "application", ref: "gross_monthly_income_cents", backing: "column" },

  // ── Moment 4: signing ───────────────────────────────────────────────────────
  { key: "deposit",        label: "Deposit",                 fieldClass: "per_lease", moment: "signing",    required: true,  source: "lease",       ref: "deposit_amount_cents",       backing: "column" },
  { key: "lease_clauses",  label: "Lease clauses",           fieldClass: "per_lease", moment: "signing",    required: true,  source: "lease",       ref: "lease_clause_selections",    backing: "table"  },
  { key: "period_confirm", label: "Confirm lease period",    fieldClass: "straddle",  moment: "signing",    required: true,  source: "lease",       ref: "start_date",                 backing: "column" },

  // ── Moment 5: ingoing ───────────────────────────────────────────────────────
  { key: "inspection_profile", label: "Inspection room layout", fieldClass: "durable", moment: "ingoing",   required: true,  source: "unit",        ref: "unit_inspection_profile_rooms", backing: "table"  },
]

export function fieldsForMoment(moment: JourneyMoment): JourneyField[] {
  return JOURNEY_FIELDS.filter((f) => f.moment === moment)
}

/** The minimum set that gates a moment's value (skippable enrichment excluded). */
export function requiredFloor(moment: JourneyMoment): JourneyField[] {
  return JOURNEY_FIELDS.filter((f) => f.moment === moment && f.required)
}

/** Fields that carry over to the next lease (durable + the durable side of straddle) — the compounding set. */
export function durableFields(): JourneyField[] {
  return JOURNEY_FIELDS.filter((f) => f.fieldClass === "durable" || f.fieldClass === "straddle")
}

/** Fields re-confirmed on every lease (never inherited). */
export function perLeaseFields(): JourneyField[] {
  return JOURNEY_FIELDS.filter((f) => f.fieldClass === "per_lease")
}
