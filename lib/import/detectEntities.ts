/**
 * lib/import/detectEntities.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import type { ColumnSuggestion } from "./columnMapper"

export interface DetectedEntities {
  hasTenant: boolean
  hasUnit: boolean
  hasLease: boolean
  hasBank: boolean
}

/**
 * Detect which entity types are present based on column mapping suggestions.
 */
export function detectEntities(suggestions: ColumnSuggestion[]): DetectedEntities {
  const matched = suggestions.filter((s) => s.field !== null)

  return {
    hasTenant: matched.some((s) => s.entity === "tenant"),
    hasUnit: matched.some((s) => s.entity === "unit"),
    hasLease: matched.some((s) => s.entity === "lease"),
    hasBank: matched.some((s) => s.entity === "bank"),
  }
}
