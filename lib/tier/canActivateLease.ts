/**
 * lib/tier/canActivateLease.ts — Guard lease activation against the org's tier lease cap
 *
 * Auth:   Server-only; called from lease activation actions
 * Data:   getOrgTier (cookie fast-path + DB fallback), getActiveLeaseCount
 * Notes:  Returns ok:false with an upgrade prompt when the cap is reached — no overages.
 */
import { getOrgTier } from "./getOrgTier"
import { getActiveLeaseCount } from "./getActiveLeaseCount"

const LEASE_LIMITS: Record<string, number> = {
  owner:     1,
  steward:   15,
  growth:    30,
  portfolio: 75,
  firm:      150,
  bespoke:   Infinity,
}

/**
 * Checks whether an org can activate another lease against their tier cap.
 * Bespoke tier has no hard cap (custom contract governs).
 */
export async function canActivateLease(
  orgId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const [tier, count] = await Promise.all([
    getOrgTier(orgId),
    getActiveLeaseCount(orgId),
  ])

  const limit = LEASE_LIMITS[tier] ?? 1

  if (count >= limit) {
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1)
    const limitLabel = limit === 1 ? "1 active lease" : `${limit} active leases`
    return {
      ok: false,
      reason: `You've reached your active lease limit. ${tierLabel} tier allows ${limitLabel}. Upgrade to activate more.`,
    }
  }

  return { ok: true }
}
