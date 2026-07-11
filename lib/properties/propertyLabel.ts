/**
 * lib/properties/propertyLabel.ts — the single way to render a "unit, property" display label
 *
 * Auth:   none — pure formatting (formatPropertyLabel) / a display-only read (resolvePropertyLabel)
 * Data:   a joined unit row `{ unit_number, properties: { name } }` (PostgREST embed) — or units(unit_number,
 *         properties(name)) fetched by id
 * Notes:  ~100 sites hand-built `${unit.unit_number}, ${unit.properties.name}` inline, each with its own
 *         separator (", " vs " — "), fallback ("your property" / "the property" / "—" / "Unknown") and
 *         null-handling. This is the SSOT. Separator + fallback are OPTIONS so a migration is behaviour-
 *         preserving (pass the site's existing separator/fallback). `pleks/no-rerolled-property-label`
 *         forbids re-rolling the concat. Named formatPropertyLabel/resolvePropertyLabel — NOT `propertyLabel`
 *         (that bare name collides with ~40 local bindings across the tree).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** A property row (or PostgREST array-of-one embed) that carries at least the display `name`. */
type PropertyNameCarrier = { name?: string | null } | { name?: string | null }[] | null | undefined

/** The minimal joined unit shape a label needs. Widened (all optional/nullable) so every real call-site row
 *  — however it typed its `as` cast — structurally satisfies it. */
export interface UnitLabelRow {
  unit_number?: string | null
  properties?: PropertyNameCarrier
}

export interface PropertyLabelOptions {
  /** Joiner between unit number and property name. Default ", " (the dominant convention). */
  separator?: string
  /** Returned when the unit (or both parts) is absent. Default "your property". */
  fallback?: string
}

/** PostgREST embeds a to-one relation as an object, but can type/return it as a one-element array — take the
 *  first either way. */
function propertyName(p: PropertyNameCarrier): string | null {
  const row = Array.isArray(p) ? p[0] : p
  return row?.name ?? null
}

/**
 * Format "unit, property" from a joined unit row. Behaviour-preserving vs the inline concats: with both parts
 * present it is `${unit_number}${separator}${name}`; with the unit (or a part) missing it is the fallback.
 * Never emits a literal "undefined" — a present-but-partial row degrades to whichever part exists.
 */
export function formatPropertyLabel(unit: UnitLabelRow | null | undefined, opts?: PropertyLabelOptions): string {
  const separator = opts?.separator ?? ", "
  const fallback = opts?.fallback ?? "your property"
  if (!unit) return fallback
  const parts = [unit.unit_number, propertyName(unit.properties)].filter((s): s is string => !!s && s.trim() !== "")
  return parts.length ? parts.join(separator) : fallback
}

/**
 * Resolve a property label from just a unitId — for callers that hold an id but have not already fetched the
 * unit. Display-only (no org gate; the caller has already authorised the surface it renders on). A null/absent
 * id, a not-found unit, or a query error all return the fallback without throwing. Accepts either the service
 * or the gateway client.
 */
export async function resolvePropertyLabel(
  db: SupabaseClient,
  unitId: string | null | undefined,
  opts?: PropertyLabelOptions,
): Promise<string> {
  if (!unitId) return opts?.fallback ?? "your property"
  const { data, error } = await db
    .from("units")
    .select("unit_number, properties(name)")
    .eq("id", unitId)
    .maybeSingle()
  logQueryError("resolvePropertyLabel", error)
  return formatPropertyLabel(data as UnitLabelRow | null, opts)
}
