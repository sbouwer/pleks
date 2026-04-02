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

export const FEATURE_CLAUSE_MAP: Record<string, string[]> = {
  "Alarm":                 ["security"],
  "Pool":                  ["common_property"],
  "Garden":                ["common_property"],
  "Wheelchair-accessible": ["wheelchairs"],
  "Air-conditioning":      ["aircon"],
  "Pet-friendly":          ["pets"],
  "Solar":                 ["utilities_alternative"],
  "Borehole":              ["utilities_alternative"],
  "Garage":                ["parking"],
  "Carport":               ["parking"],
  "Fibre":                 ["telecommunications"],
  "DSTV":                  ["telecommunications"],
}

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
