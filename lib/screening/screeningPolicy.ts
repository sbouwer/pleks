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
 *         Policy rows are immutable (mutation trigger); per-agency authoring lives at /settings/compliance —
 *         each save inserts a NEW version (newest wins), so the decision-time snapshot is never mutated (O-17).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { INCOME_AFFORDABILITY_THRESHOLD } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"
import type { PoolingRule } from "@/lib/applications/companyRuling"

/** The id + immutable version snapshot to stamp onto a decision (applications.screening_policy_id/_version). */
export interface ResolvedScreeningPolicy {
  id: string
  version: string
  /** The active policy's affordability threshold (rent-to-income ceiling), or the platform default (O-19). */
  affordabilityThreshold: number
}

/** Read the affordability threshold from a policy jsonb, falling back to the platform constant when absent/invalid. */
function readAffordabilityThreshold(policy: unknown): number {
  const t = (policy as { affordability_threshold?: unknown } | null)?.affordability_threshold
  return typeof t === "number" && t > 0 && t <= 1 ? t : INCOME_AFFORDABILITY_THRESHOLD
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
  // The dispositive company-surety pooling rule (14P §5). Conservative default until an org configures it; the
  // legal BOUNDS are enforced in companyRuling regardless (combined/group collapse to strongestSingle until every
  // surety is executed), so even a "combined" config only bites on a post-signing re-scan.
  pooling_rule: "strongestSingle",
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
    .select("id, version, policy")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    logQueryError("resolveActiveScreeningPolicy read", error)
    return "error"
  }
  return data
    ? { id: data.id as string, version: data.version as string, affordabilityThreshold: readAffordabilityThreshold(data.policy) }
    : null
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
    .select("id, version, policy")
    .single()

  if (error) {
    // Likely a concurrent seed hitting UNIQUE(org_id, version) — re-read the winning row.
    const raced = await readLatestPolicy(db, orgId)
    if (raced && raced !== "error") return raced
    logQueryError("resolveActiveScreeningPolicy seed", error)
    return null
  }
  return { id: data.id as string, version: data.version as string, affordabilityThreshold: readAffordabilityThreshold(data.policy) }
}

/**
 * The org's dispositive company-surety pooling rule (14P §5) from its active policy. Conservative default
 * (strongestSingle) when the org has no policy / no rule set / on any read error — the legal bounds are enforced
 * in companyRuling regardless (the execution gate), so the default is safe by construction.
 */
export async function resolvePoolingRule(db: SupabaseClient, orgId: string): Promise<PoolingRule> {
  const { data, error } = await db
    .from("screening_policies").select("policy")
    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (error) { logQueryError("resolvePoolingRule", error); return "strongestSingle" }
  const rule = (data?.policy as { pooling_rule?: string } | null)?.pooling_rule
  return rule === "combined" || rule === "suretyGroupPooled" ? rule : "strongestSingle"
}
