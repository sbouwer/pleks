/**
 * lib/migration/burndown.ts — the migration-completeness metric (ADDENDUM_21E §6)
 *
 * Notes:  "N records need completion", per entity, for an org — the burn-down the agency watches finish. It reads
 *         the `incomplete_mandatory` flag (§5) each entity carries plus the open `blocked_pending_field` rows
 *         (§3A). The invariant that makes it CONVERGE lives elsewhere (§1: an incomplete record can only be born
 *         from import, never live-create); this module just measures it.
 *
 *         Named `burndown`, not `completeness` — the word is already taken by `computePropertyCompleteness`
 *         (BUILD_60) and `journeyCompleteness` (BUILD_69), both unrelated to migration.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface MigrationBurndown {
  properties: number
  tenants: number
  landlords: number
  leases: number
  /** Open automated-action blocks waiting on a field (§3A-safety). */
  blocked: number
  /** properties + tenants + landlords + leases — the records still on the burn-down. */
  total: number
}

async function countIncomplete(
  db: SupabaseClient, table: string, orgId: string, role?: string,
): Promise<number> {
  // `incomplete_mandatory` is NULL exactly when the record is complete (the registry writer sets null), so
  // NOT NULL is the incomplete set. `head: true` returns only the count.
  let q = db.from(table).select("id", { count: "exact", head: true })
    .eq("org_id", orgId).not("incomplete_mandatory", "is", null)
  if (role) q = q.eq("primary_role", role)
  const { count, error } = await q
  if (error) { console.error(`burndown count ${table} failed:`, error.message); return 0 }
  return count ?? 0
}

/** The org's migration burn-down. Every count only ever DECREASES over time (§6 invariant): new incompletes
 *  arrive only from import batches; no live-create action adds one (§1). */
export async function getMigrationBurndown(db: SupabaseClient, orgId: string): Promise<MigrationBurndown> {
  const [properties, tenants, landlords, leases] = await Promise.all([
    countIncomplete(db, "properties", orgId),
    countIncomplete(db, "contacts", orgId, "tenant"),
    countIncomplete(db, "contacts", orgId, "landlord"),
    countIncomplete(db, "leases", orgId),
  ])
  const { count: blocked, error } = await db
    .from("blocked_pending_field").select("id", { count: "exact", head: true })
    .eq("org_id", orgId).is("resolved_at", null)
  if (error) console.error("burndown count blocked_pending_field failed:", error.message)

  return { properties, tenants, landlords, leases, blocked: blocked ?? 0, total: properties + tenants + landlords + leases }
}
