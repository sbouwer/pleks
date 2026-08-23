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
 *
 * THROWS if the dedup state cannot be read. That is deliberate and it is the whole point of the
 * function: the previous body was `const { count } = await query; return (count ?? 0) > 0`, which
 * turned any query fault into `false` — and `false` here means "not actioned yet", so a transient
 * database error made the rule fire AGAIN. Four rules use this, including the deposit-return
 * notices, so the failure landed in a tenant's inbox rather than in a log.
 *
 * Defaulting the other way (`count ?? 1`) is NOT the fix — that converts a fault into permanent
 * suppression, which is the statutory-notice failure mode that is worse than the duplicate. An
 * unreadable dedup state is neither "done" nor "not done"; it is unknown, and the only honest thing
 * to do with it is refuse to decide. The engine catches this, reports it to Sentry and writes an
 * `error` rule_run — so the condition is recorded as unevaluated instead of answered wrongly.
 * M-090.
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
  const { count, error } = await query
  if (error) {
    throw new Error(
      `hasBeenActionedFor(${ruleId}, ${entityId}) could not read rule_runs: ${error.message}. ` +
        `Refusing to guess — a wrong answer here either duplicates a notice or suppresses one.`,
    )
  }
  return (count ?? 0) > 0
}
