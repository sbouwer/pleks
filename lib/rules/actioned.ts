/**
 * lib/rules/actioned.ts — entity-level deduplication helper for rule conditions
 *
 * Auth:   none of its own — the caller passes the client it is already authorised on (the daily
 *         cron passes a service-role client).
 * Data:   rule_runs, matched on rule_id + outcome + payload.entity_id.
 * Notes:  Lives apart from engine.ts because every rule that dedups per entity calls this, and the
 *         engine imports the registry that imports those rules — so a rule reaching back into the
 *         engine for this one function closed a runtime loop through the registry. The rule→engine
 *         edge was a VALUE import, not a type-only one, which is why extracting `types.ts` did not
 *         break it. Rules using per-entity dedup must include entity_id in their action's data.
 *         See BUILD_67_RULES_ENGINE.md §Idempotency for the two dedup patterns.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Returns true if this rule has already been actioned for the given entity
 * (identified by entity_id in rule_runs.payload) within the optional time window.
 */
export async function hasBeenActionedFor(
  supabase: SupabaseClient,
  ruleId: string,
  entityId: string,
  since?: Date,
): Promise<boolean> {
  let query = supabase
    .from("rule_runs")
    .select("id", { head: true, count: "exact" })
    .eq("rule_id", ruleId)
    .eq("outcome", "actioned")
    .contains("payload", { entity_id: entityId })
  if (since) query = query.gte("evaluated_at", since.toISOString())
  const { count } = await query
  return (count ?? 0) > 0
}
