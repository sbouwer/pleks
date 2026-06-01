/**
 * lib/tier/onTierChanged.ts — tier-change side-effect hook (ADDENDUM_01C §4/§5)
 *
 * Auth:   Server-only; service client. Called by changeTier (admin) and any future
 *         self-service upgrade path AFTER the subscriptions.update lands.
 * Data:   landlords (org scope), user_profiles (the self_landlord_id binding + fork stamp)
 * Notes:  The Owner→Steward+ identity fork (D-01C-03/05) is the only side-effect today.
 *         The fork is a single UPDATE that clears self_landlord_id + stamps identity_forked_at;
 *         clearing the binding makes the §13 AFTER-UPDATE sync trigger early-return
 *         (`IF NEW.self_landlord_id IS NULL THEN RETURN NEW`), so the fork is atomic and
 *         fires no sync ping-pong. Lossless: the sync kept the bound pair identical, so the
 *         two records simply stop being bound (D-01C-03). The hook is a reusable primitive —
 *         future tier-dependent logic (lease-limit re-checks, feature toggles) hangs off it.
 */
import { createServiceClient } from "@/lib/supabase/server"
import type { Tier } from "@/lib/constants"

export interface TierChangeResult {
  /** Number of bound self-managed identities forked into standalone records (0 or 1 in practice). */
  forked: number
}

/**
 * Fire tier-change side-effects after a subscription tier write.
 * Currently: the Owner→Steward+ identity fork (ADDENDUM_01C §5).
 */
export async function onTierChanged(
  orgId: string,
  oldTier: Tier,
  newTier: Tier,
): Promise<TierChangeResult> {
  // The fork fires only on the free→paid, single→multi boundary: Owner → anything higher.
  // Downgrade (Steward+→Owner) does NOT auto-re-merge (D-01C-07); lateral paid moves are no-ops here.
  const isUpgradeFromOwner = oldTier === "owner" && newTier !== "owner"
  if (!isUpgradeFromOwner) return { forked: 0 }

  const service = await createServiceClient()

  // Landlords in this org — a self-managed binding (user_profiles.self_landlord_id) points at one.
  const { data: landlords, error: llErr } = await service
    .from("landlords")
    .select("id")
    .eq("org_id", orgId)
  if (llErr) {
    console.error("[onTierChanged] landlords lookup failed:", llErr.message)
    return { forked: 0 }
  }
  const landlordIds = (landlords ?? []).map((l) => l.id)
  if (landlordIds.length === 0) return { forked: 0 }

  // Find the bound self-managed identity (≤1 per org — self_landlord_id is uniquely indexed).
  // We capture self_landlord_id first because the fork must preserve which landlord WAS us
  // (forked_landlord_id) so the landlord-surface banner can find its record after the binding clears.
  const { data: bound, error: boundErr } = await service
    .from("user_profiles")
    .select("id, self_landlord_id")
    .in("self_landlord_id", landlordIds)
  if (boundErr) {
    console.error("[onTierChanged] bound-profile lookup failed:", boundErr.message)
    return { forked: 0 }
  }
  if (!bound || bound.length === 0) return { forked: 0 } // family-managed Owner: nothing coupled

  const forkedAt = new Date().toISOString()
  let count = 0
  for (const profile of bound) {
    // Atomic fork (D-01C-03): one UPDATE per profile — capture forked_landlord_id, clear the
    // binding, stamp the fork time, re-arm the banner. Clearing self_landlord_id makes the §13
    // sync trigger early-return, so no sync side-effect fires.
    const { error: forkErr } = await service
      .from("user_profiles")
      .update({
        self_landlord_id: null,
        forked_landlord_id: profile.self_landlord_id,
        identity_forked_at: forkedAt,
        fork_banner_dismissed_agent: false,
        fork_banner_dismissed_landlord: false,
      })
      .eq("id", profile.id)
    if (forkErr) {
      console.error("[onTierChanged] identity fork failed:", forkErr.message)
      continue
    }
    count += 1
    await service.from("audit_log").insert({
      org_id: orgId,
      table_name: "user_profiles",
      record_id: profile.id,
      action: "UPDATE",
      new_values: {
        action: "identity_forked",
        old_tier: oldTier,
        new_tier: newTier,
        forked_landlord_id: profile.self_landlord_id,
      },
    })
  }
  return { forked: count }
}
