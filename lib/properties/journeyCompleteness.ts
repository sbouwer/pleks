/**
 * lib/properties/journeyCompleteness.ts — BUILD_69 Component C: per-moment required-floor completeness
 *
 * Reads the durable/per-lease/straddle SSOT (journeyFieldModel) and a server-fetched context to compute, per
 * contact moment, which required-floor fields are filled vs missing — so the UI can surface "what's needed next"
 * at each moment (the de-walling mechanic) instead of dropping all setup at signing. Pure + side-effect-free;
 * the caller fetches the unit/property/lease/application + the two table-backed presence flags.
 */
import {
  JOURNEY_MOMENTS,
  requiredFloor,
  type JourneyMoment,
  type JourneyField,
} from "./journeyFieldModel"

export interface JourneyContext {
  property?: Record<string, unknown> | null
  unit?: Record<string, unknown> | null
  lease?: Record<string, unknown> | null
  application?: Record<string, unknown> | null
  hasInspectionProfile?: boolean // unit_inspection_rooms rows exist for the unit
  hasLeaseClauses?: boolean       // lease_clause_selections rows exist for the lease
}

export interface MomentCompleteness {
  moment: JourneyMoment
  total: number        // required-floor field count
  filled: number
  complete: boolean    // every required-floor field is filled
  missing: JourneyField[]
}

function valuePresent(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false
  if (typeof v === "number" && Number.isNaN(v)) return false
  return true
}

function isFilled(field: JourneyField, ctx: JourneyContext): boolean {
  if (field.backing === "table") {
    if (field.ref === "unit_inspection_profile_rooms") return ctx.hasInspectionProfile === true
    if (field.ref === "lease_clause_selections") return ctx.hasLeaseClauses === true
    return false
  }
  let src: Record<string, unknown> | null | undefined
  switch (field.source) {
    case "property":    src = ctx.property; break
    case "unit":        src = ctx.unit; break
    case "lease":       src = ctx.lease; break
    case "application": src = ctx.application; break
    default:            src = null   // "listing" — no column-backed listing fields in the model
  }
  if (!src) return false
  return valuePresent(src[field.ref])
}

export function momentCompleteness(moment: JourneyMoment, ctx: JourneyContext): MomentCompleteness {
  const floor = requiredFloor(moment)
  const missing = floor.filter((f) => !isFilled(f, ctx))
  return {
    moment,
    total: floor.length,
    filled: floor.length - missing.length,
    complete: missing.length === 0,
    missing,
  }
}

/** Completeness for every moment, in journey order. */
export function journeyCompleteness(ctx: JourneyContext): MomentCompleteness[] {
  return JOURNEY_MOMENTS.map((m) => momentCompleteness(m.moment, ctx))
}
