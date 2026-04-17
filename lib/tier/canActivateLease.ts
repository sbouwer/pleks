import { getOrgTier } from "./getOrgTier"
import { getActiveLeaseCount } from "./getActiveLeaseCount"

const LEASE_LIMITS: Record<string, number> = {
  owner:   1,
  steward: 20,
  firm:    Infinity,
}

/**
 * Checks whether an org can activate another lease.
 * Owner tier = 1 active lease max.
 * Steward tier = 20 active leases max.
 * Firm tier = unlimited.
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
