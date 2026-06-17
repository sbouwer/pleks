/**
 * lib/dashboard/discretionDeclineRate.ts — agent-level agent-discretion decline-rate flag (F3 control #4)
 *
 * Auth:   service client (dashboard read, org-scoped)
 * Data:   applications (decline_reason_code, decided_by, decided_at), user_profiles (agent names)
 * Notes:  Replaces the spec's "manager-review gate" with a visibility metric (CD ruling 2026-06-17): a
 *         blocking per-decision acknowledgement is workflow theatre managers wouldn't exercise. Counsel's
 *         real concern was OVERUSE of decline_agent_discretion_documented becoming a universal escape
 *         hatch — so we surface each agent's discretion-decline rate where managers already look (the
 *         dashboard attention queue) and flag when it crosses a threshold. The deterrent is the metric's
 *         existence; the manager investigates only if a rate looks off. The audit trail (every use logs a
 *         100-char-explanation row) + annual enum review are the other two layers.
 */
import { getCachedServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { DECLINE_AGENT_DISCRETION_CODE } from "@/lib/screening/decisionReasons"

/** A discretionary decline becomes "overuse" at this share of an agent's declines… */
export const DISCRETION_RATE_FLAG_THRESHOLD = 0.15
/** …but only once the agent has enough declines for the rate to be meaningful (avoids 1/1 = 100% noise). */
export const DISCRETION_MIN_DECLINES_TO_FLAG = 5

export interface DiscretionDeclineFlag {
  agentId: string
  discretionCount: number
  totalDeclines: number
  ratePct: number   // 0–100, rounded
}

interface DeclineRow { decided_by: string | null; decline_reason_code: string | null }

/**
 * Pure aggregator: group stage-2 declines by deciding agent, compute the discretion share, and return only
 * the agents over the flag threshold (and above the minimum-volume floor). Exported for unit testing.
 */
export function computeDiscretionFlags(
  rows: DeclineRow[],
  threshold = DISCRETION_RATE_FLAG_THRESHOLD,
  minDeclines = DISCRETION_MIN_DECLINES_TO_FLAG,
): DiscretionDeclineFlag[] {
  const byAgent = new Map<string, { total: number; discretion: number }>()
  for (const r of rows) {
    if (!r.decided_by || !r.decline_reason_code) continue
    const agg = byAgent.get(r.decided_by) ?? { total: 0, discretion: 0 }
    agg.total++
    if (r.decline_reason_code === DECLINE_AGENT_DISCRETION_CODE) agg.discretion++
    byAgent.set(r.decided_by, agg)
  }

  const flags: DiscretionDeclineFlag[] = []
  for (const [agentId, agg] of byAgent) {
    if (agg.total < minDeclines) continue
    const rate = agg.discretion / agg.total
    if (rate < threshold) continue
    flags.push({ agentId, discretionCount: agg.discretion, totalDeclines: agg.total, ratePct: Math.round(rate * 100) })
  }
  return flags.sort((a, b) => b.ratePct - a.ratePct)
}

/** Resolve display names for a set of agent ids (user_orgs → user_profiles). Unmatched → "Unnamed". */
async function resolveAgentNames(
  supabase: Awaited<ReturnType<typeof getCachedServiceClient>>,
  orgId: string,
  agentIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (agentIds.length === 0) return names
  const { data, error } = await supabase
    .from("user_orgs")
    .select("user_id, user_profiles(full_name, first_name, last_name)")
    .eq("org_id", orgId)
    .in("user_id", agentIds)
  logQueryError("resolveAgentNames", error)
  type Row = { user_id: string; user_profiles: { full_name: string | null; first_name: string | null; last_name: string | null } | null }
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = r.user_profiles
    names.set(r.user_id, [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.full_name || "Unnamed")
  }
  return names
}

/** Flagged agents (this calendar month) with display names, for the dashboard attention queue. */
export async function getDiscretionDeclineFlags(orgId: string): Promise<Array<DiscretionDeclineFlag & { agentName: string }>> {
  const supabase = await getCachedServiceClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const { data, error } = await supabase
    .from("applications")
    .select("decided_by, decline_reason_code")
    .eq("org_id", orgId)
    .not("decline_reason_code", "is", null)
    .gte("decided_at", monthStart.toISOString())
  if (error) { logQueryError("getDiscretionDeclineFlags", error); return [] }

  const flags = computeDiscretionFlags((data ?? []) as DeclineRow[])
  const names = await resolveAgentNames(supabase, orgId, flags.map((f) => f.agentId))
  return flags.map((f) => ({ ...f, agentName: names.get(f.agentId) ?? "Unnamed" }))
}
