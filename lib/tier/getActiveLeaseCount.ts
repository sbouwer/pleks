/**
 * lib/tier/getActiveLeaseCount.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Returns the number of active leases for an org.
 * "Active" includes leases in notice period — they're still billable.
 * Used as the Owner tier gate (1 active lease limit) instead of property count.
 */
export async function getActiveLeaseCount(orgId: string): Promise<number> {
  const db = await createServiceClient()
  const { count, error } = await db
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["active", "notice"])
    .is("deleted_at", null)

  if (error) {
    console.error("getActiveLeaseCount failed:", error.message)
    return 0
  }

  return count ?? 0
}
