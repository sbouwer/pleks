"use server"

/**
 * lib/dev/devTier.ts — DEV-ONLY: switch the current org's subscription tier (REMOVE BEFORE LAUNCH)
 *
 * Auth:   hard-gated to DEV_TIER_EMAIL server-side — anyone else gets "Not allowed".
 * Data:   writes subscriptions (the canonical tier source read by getOrgTierCanonical + useTier), so the
 *         whole app behaves as the chosen tier after a reload. Find-or-insert the active sub row.
 * Notes:  Temporary testing aid. Delete lib/dev/, components/dev/DevTierToggle, and the TopBar line to remove.
 */
import { gateway } from "@/lib/supabase/gateway"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { type Tier } from "@/lib/constants"
import { DEV_TIER_EMAIL } from "./devTierConfig"

export async function devSetTier(tier: Tier): Promise<{ ok: true } | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if ((user?.email ?? "").toLowerCase() !== DEV_TIER_EMAIL) return { error: "Not allowed" }

  const service = await createServiceClient()
  const { orgId } = gw
  const { data: existing, error: readErr } = await service
    .from("subscriptions").select("id").eq("org_id", orgId).in("status", ["active", "trialing"]).limit(1).maybeSingle()
  if (readErr) return { error: readErr.message }

  if (existing?.id) {
    // active=true + trial cleared so getEffectiveTier returns `tier` directly
    const { error } = await service
      .from("subscriptions").update({ tier, status: "active", trial_ends_at: null, trial_converted: true }).eq("id", existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await service.from("subscriptions").insert({ org_id: orgId, tier, status: "active" })
    if (error) return { error: error.message }
  }
  return { ok: true }
}
