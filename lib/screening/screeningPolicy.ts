/**
 * lib/screening/screeningPolicy.ts — resolve the org's active screening-policy version at decision time
 *
 * Auth:   service-role db (the caller is an authorised decision-write path through gateway()). The
 *         screening_policies INSERT policy is RLS-blocked (WITH CHECK false); only the service client
 *         may seed — which is exactly the decision-write context.
 * Data:   screening_policies (per-org, versioned, immutable). criminal_screening_policies is the parallel
 *         table but stays DORMANT (criminal screening is out of Pleks scope per INDEX 14E — the DB CHECK
 *         is the backstop; no app-layer authoring/resolution is built).
 * Notes:  F3 decision-accountability (amendment §2.1e). Every terminal decision links to the platform-wide
 *         screening-policy version in force at decision time. The "active" version = the latest row for the
 *         org (no separate active-flag — newest by created_at wins). If the org has no policy row yet, this
 *         seeds a platform-default "v0" capturing the current thresholds and links to that (the spec's
 *         "backfill from a policy v0 default" — prospective-only model, no legacy free-text re-decode).
 *         Policy rows are immutable (mutation trigger); a real per-agency authoring surface is deferred.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { INCOME_AFFORDABILITY_THRESHOLD } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** The id + immutable version snapshot to stamp onto a decision (applications.screening_policy_id/_version). */
export interface ResolvedScreeningPolicy {
  id: string
  version: string
}

/** Platform-default policy version seeded for an org on first decision when none exists. */
export const PLATFORM_DEFAULT_SCREENING_POLICY_VERSION = "platform-default-v0"

/**
 * The platform-default screening posture — the thresholds the engine/agents actually apply today, captured
 * as a policy snapshot so a tribunal can ask "what threshold was in force on the decision date?". Values
 * derive from SSOT constants (never hardcode); when a real authoring surface lands, agencies version on top.
 */
const PLATFORM_DEFAULT_SCREENING_POLICY = {
  source: "platform-default",
  affordability_threshold: INCOME_AFFORDABILITY_THRESHOLD,
  note: "Auto-seeded platform-default screening policy (F3 round-4). Captures the platform's screening "
    + "posture at decision time. Immutable; per-agency policy authoring is a deferred follow-up.",
} as const

/**
 * Read the latest policy row for the org (active = newest version). Returns the row, null if the org has
 * none, or "error" if the query itself failed (so the caller can distinguish "no policy yet, seed one"
 * from "DB unreachable, don't seed").
 */
async function readLatestPolicy(db: SupabaseClient, orgId: string): Promise<ResolvedScreeningPolicy | null | "error"> {
  const { data, error } = await db
    .from("screening_policies")
    .select("id, version")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    logQueryError("resolveActiveScreeningPolicy read", error)
    return "error"
  }
  return data ? { id: data.id as string, version: data.version as string } : null
}

/**
 * Resolve the org's active screening-policy version, seeding a platform-default v0 if the org has none.
 * Returns null only on an unrecoverable DB error (the caller then leaves screening_policy_id null rather
 * than block the decision — the linkage is defence-strengthening, not a hard gate, per the model fork). A
 * transient READ error does NOT trigger a seed (avoids spurious policy rows); only a genuine "no row" does.
 *
 * Concurrency: UNIQUE(org_id, version) makes the seed race-safe — if two decisions seed v0 at once, one
 * wins and the loser re-reads the winner's row.
 */
export async function resolveActiveScreeningPolicy(
  db: SupabaseClient,
  orgId: string,
): Promise<ResolvedScreeningPolicy | null> {
  const existing = await readLatestPolicy(db, orgId)
  if (existing === "error") return null            // transient read failure — don't seed, no linkage
  if (existing) return existing

  const { data, error } = await db
    .from("screening_policies")
    .insert({
      org_id: orgId,
      version: PLATFORM_DEFAULT_SCREENING_POLICY_VERSION,
      policy: PLATFORM_DEFAULT_SCREENING_POLICY,
    })
    .select("id, version")
    .single()

  if (error) {
    // Likely a concurrent seed hitting UNIQUE(org_id, version) — re-read the winning row.
    const raced = await readLatestPolicy(db, orgId)
    if (raced && raced !== "error") return raced
    logQueryError("resolveActiveScreeningPolicy seed", error)
    return null
  }
  return { id: data.id as string, version: data.version as string }
}
