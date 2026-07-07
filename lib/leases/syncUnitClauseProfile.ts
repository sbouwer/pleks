/**
 * lib/leases/syncUnitClauseProfile.ts — sync unit_clause_defaults from a unit's features: auto-enable mapped clauses, remove stale auto entries
 *
 * Data:   reads/writes unit_clause_defaults (org-scoped); supabase client passed in by caller.
 * Notes:  only auto_set=true rows are managed here — manual overrides (auto_set=false) are never touched.
 */
import { getAutoClausesForFeatures } from "./featureClauseMap"
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

/**
 * Syncs the unit_clause_defaults table based on unit features.
 *
 * Rules:
 * - Features that map to clause keys → upsert with auto_set=true, enabled=true
 * - Previous auto_set entries whose feature is removed → delete
 * - Entries where auto_set=false (manual overrides) → NEVER touched
 */
export async function syncUnitClauseProfile(
  supabase: SupabaseClient,
  unitId: string,
  orgId: string,
  features: string[]
): Promise<void> {
  const autoClauses = getAutoClausesForFeatures(features)

  const { data: existing, error: existingError } = await supabase
    .from("unit_clause_defaults")
    .select("id, clause_key, enabled, auto_set")
    .eq("unit_id", unitId)
    logQueryError("syncUnitClauseProfile unit_clause_defaults", existingError)

  const existingMap = new Map((existing ?? []).map((e) => [e.clause_key, e]))

  const toUpsert: Array<{
    unit_id: string
    org_id: string
    clause_key: string
    enabled: boolean
    auto_set: boolean
  }> = []
  const toDelete: string[] = []

  // Auto-mapped clauses: ensure enabled with auto_set=true
  for (const clauseKey of autoClauses) {
    const entry = existingMap.get(clauseKey)
    if (!entry || (entry.auto_set && !entry.enabled)) {
      // New mapping, or was auto-set but disabled (feature removed then re-added) — create/re-enable
      toUpsert.push({ unit_id: unitId, org_id: orgId, clause_key: clauseKey, enabled: true, auto_set: true })
    }
    // entry.auto_set === false → manual override, never touch
  }

  // Auto-set entries whose feature is gone → remove
  for (const entry of existing ?? []) {
    if (entry.auto_set && !autoClauses.includes(entry.clause_key)) {
      toDelete.push(entry.id)
    }
  }

  if (toUpsert.length > 0) {
    await supabase
      .from("unit_clause_defaults")
      .upsert(toUpsert, { onConflict: "unit_id,clause_key" })
  }
  if (toDelete.length > 0) {
    await supabase
      .from("unit_clause_defaults")
      .delete()
      .in("id", toDelete)
      .eq("org_id", orgId)
  }
}
