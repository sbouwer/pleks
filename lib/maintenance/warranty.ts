/**
 * lib/maintenance/warranty.ts — Warranty subject derivation + Haiku match call
 *
 * Auth:   Server-only
 * Data:   pure — derives a warranty subject string. No AI call remains in this module.
 * Notes:  findWarrantyMatch (the Haiku match call) was removed 2026-08-20 as a dead export.
 *         WarrantyMatchInput/WarrantyMatchResult survive it and are now unreferenced; they are
 *         kept because reviving the match call needs its contract, not because anything uses them.
 *         The match prompt was conservative by design (D-60B-12): bias toward false negatives.
 * @knipignore Kept on record after findWarrantyMatch was deliberately removed 2026-08-20: reviving the match
 * call needs its contract.
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

/**
 * @knipignore See WarrantyMatchInput above — the other half of the removed function's contract.
 */
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

