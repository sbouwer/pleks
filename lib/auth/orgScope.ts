/**
 * lib/auth/orgScope.ts — validate a CLIENT-SUPPLIED entity id belongs to the caller's org (F-2 defence)
 *
 * Auth:   server-only; the caller has already resolved orgId from the session (gateway / requireAgentWriteAccess)
 * Notes:  The referenced-FK IDOR class (AUDIT_IMPORT F-2): a request supplies a lease_id / unit_id / etc. that
 *         the code then READS or REFERENCES without checking it belongs to the caller's org. The
 *         `pleks/require-org-scope-on-service-write` rule cannot see this — it checks the WRITE's own org_id,
 *         not that a referenced FK was validated. Route every "is this client-supplied id mine?" check through
 *         `isRowInOrg` so the pattern is greppable, testable, and one place to reason about.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

/**
 * True iff a row with `id` exists in `table` AND belongs to `orgId`. Returns false for a null/empty id (a
 * missing required FK is not "in the org"). Use to gate a client-supplied FK before referencing it:
 *
 *   if (!(await isRowInOrg(db, "units", unitId, orgId))) return { error: "Not found" }        // required
 *   if (leaseId && !(await isRowInOrg(db, "leases", leaseId, orgId))) return { error: "…" }   // optional
 *
 * The row is not returned — this is an ownership assertion, not a fetch. Re-select the columns you need
 * afterward (still org-scoped) if you need the data.
 */
export async function isRowInOrg(
  db: SupabaseClient,
  table: string,
  id: string | null | undefined,
  orgId: string,
): Promise<boolean> {
  if (!id) return false
  const { data, error } = await db.from(table).select("id").eq("id", id).eq("org_id", orgId).maybeSingle()
  if (error) {
    logQueryError(`isRowInOrg ${table}`, error)
    return false   // fail closed — an unreadable ownership check is NOT an ownership grant
  }
  return !!data
}
