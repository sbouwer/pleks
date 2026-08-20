/**
 * lib/maintenance/warranty.ts — Warranty subject derivation + Haiku match call
 *
 * Auth:   Server-only
 * Data:   Anthropic API via lib/ai/client.ts (logged to ai_usage)
 * Notes:  findWarrantyMatch returns null when there are no active warranties to compare,
 *         or when the AI call fails (callers degrade gracefully — no banner shown).
 *         Match prompt is conservative by design (D-60B-12): bias toward false negatives.
 */
export interface WarrantyMatchInput {
  id: string
  subject: string
  warranty_type: string
  contractor_name?: string | null
  manufacturer_name?: string | null
  expires_on: string | null
  notes?: string | null
}

export interface WarrantyMatchResult {
  match_warranty_id: string | null
  confidence: "high" | "medium" | "low" | null
  reason: string
}

/**
 * Derive a human-readable subject line for a workmanship warranty auto-created
 * from a maintenance sign-off. Pure function — no I/O.
 */
export function deriveWarrantySubject(request: {
  title: string
  unit?: { name?: string | null } | null
}): string {
  const unitPart = request.unit?.name ? ` — ${request.unit.name}` : ""
  return `${request.title}${unitPart} (workmanship)`
}

