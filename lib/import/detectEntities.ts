import type { ColumnSuggestion } from "./columnMapper"

export interface DetectedEntities {
  hasTenant: boolean
  hasUnit: boolean
  hasLease: boolean
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
  }
}
