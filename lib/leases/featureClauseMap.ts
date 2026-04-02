/**
 * Maps unit features (from units.features text[]) to optional clause keys
 * in lease_clause_library.
 *
 * Only maps to OPTIONAL clauses. Required clauses are always included.
 * Each clause_key must exist in lease_clause_library before it can be used.
 *
 * Features without a matching clause key are listed below and will be
 * mapped when proper legal clause text is available.
 */

// ── Active mappings (clause keys exist in the library) ──────────────────────
export const FEATURE_CLAUSE_MAP: Record<string, string[]> = {
  "Alarm":                 ["security"],
  "Pool":                  ["common_property"],
  "Garden":                ["common_property"],
  "Wheelchair-accessible": ["wheelchairs"],
  "Air-conditioning":      ["aircon"],
}

// ── Future mappings (clause keys don't exist yet — need legal text) ──────────
// TODO: Add these when clause body text is written and seeded:
//   "Pet-friendly"     → "pets"             (occupancy with animals, conditions, damage liability, pet deposit)
//   "Solar"            → "utilities_alternative"  (alternative utilities, metering, maintenance responsibility)
//   "Borehole"         → "utilities_alternative"  (same clause as Solar)
//   "Garage"           → "parking"          (allocated bay/garage, access rights, vehicle restrictions)
//   "Carport"          → "parking"          (same clause as Garage)
//   "Fibre"            → "telecommunications" (fibre infrastructure, provider access, installation rights)
//   "DSTV"             → "telecommunications" (same clause as Fibre)

/**
 * Given a unit's features array, returns the clause keys that should be
 * auto-enabled for this unit.
 *
 * Deduplicates via Set — Pool + Garden both map to common_property but
 * only produce one entry. Features without a mapped clause are silently skipped.
 */
export function getAutoClausesForFeatures(features: string[]): string[] {
  const clauses = new Set<string>()
  for (const feature of features) {
    const mapped = FEATURE_CLAUSE_MAP[feature]
    if (mapped) {
      for (const key of mapped) clauses.add(key)
    }
  }
  return Array.from(clauses)
}
