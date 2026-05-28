/**
 * lib/tier/canDowngradeTo.ts — Downgrade floor: refuse a tier downgrade that would exceed the target cap
 *
 * Auth:   Server-only; must be called before any PayFast plan-change form is submitted
 * Data:   getActiveLeaseCount (service client, counts active+notice leases)
 * Notes:  No Pleks-side plan-change initiation exists yet (2026-05-27). This utility is
 *         ready-to-wire — call canDowngradeTo(orgId, targetTier) before invoking
 *         buildSubscriptionForm for a tier change, once that action is built.
 *         The invariant: active lease count ≤ tier cap at all times. This gate enforces the
 *         "coming down" direction; canActivateLease enforces the "going up" direction.
 *         A downgrade that would leave active leases above the target cap is a hard no —
 *         the org must end or transfer leases first. This prevents the over-cap limbo state.
 */
import { getActiveLeaseCount } from "./getActiveLeaseCount"
import type { Tier } from "@/lib/constants"

const LEASE_LIMITS: Record<Tier, number> = {
  owner:     1,
  steward:   15,
  growth:    30,
  portfolio: 75,
  firm:      150,
  bespoke:   Infinity,
}

/** Refuses a downgrade that would leave active leases above the target tier cap.
 *  Active = status in (active, notice) — same definition as the activation gate.
 *
 *  MUST be called before the PayFast subscription form is submitted for any downgrade,
 *  once the Pleks-side plan-change action is built. */
export async function canDowngradeTo(
  orgId: string,
  targetTier: Tier,
): Promise<{ ok: boolean; activeCount?: number; cap?: number; reason?: string }> {
  const cap = LEASE_LIMITS[targetTier] ?? 1
  const activeCount = await getActiveLeaseCount(orgId)

  if (activeCount > cap) {
    const over = activeCount - cap
    const label = targetTier.charAt(0).toUpperCase() + targetTier.slice(1)
    return {
      ok: false,
      activeCount,
      cap,
      reason:
        `You have ${activeCount} active lease${activeCount === 1 ? "" : "s"}. ` +
        `${label} allows ${cap}. ` +
        `End or transfer ${over} active lease${over === 1 ? "" : "s"} before downgrading.`,
    }
  }

  return { ok: true, activeCount, cap }
}
