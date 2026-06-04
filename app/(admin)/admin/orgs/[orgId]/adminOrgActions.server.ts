"use server"

/**
 * app/(admin)/admin/orgs/[orgId]/adminOrgActions.server.ts — admin server actions on a single org
 *
 * Auth:   Admin portal — (admin) route group is HMAC-token gated upstream; service client used here
 * Data:   organisations, subscriptions, audit_log
 * Notes:  changeTier fires onTierChanged (ADDENDUM_01C §4) AFTER the subscriptions write — the
 *         Owner→Steward+ identity fork hangs off that hook.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { startTrial } from "@/lib/trial/startTrial"
import { onTierChanged } from "@/lib/tier/onTierChanged"
import type { Tier } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function activateFoundingAgent(orgId: string) {
  const supabase = await createServiceClient()

  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + 24)

  await supabase
    .from("organisations")
    .update({
      founding_agent: true,
      founding_agent_price_cents: 29900,
      founding_agent_since: now.toISOString(),
      founding_agent_expires_at: expiresAt.toISOString(),
    })
    .eq("id", orgId)

  await supabase
    .from("subscriptions")
    .update({ amount_cents: 29900 })
    .eq("org_id", orgId)
    .eq("tier", "steward")

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "organisations",
    record_id: orgId,
    action: "UPDATE",
    new_values: { action: "founding_agent_activated" },
  })

  return { success: true }
}

export async function changeTier(orgId: string, newTier: string) {
  const supabase = await createServiceClient()

  // Read the raw tier we're replacing, for the tier-change hook (ADDENDUM_01C §4).
  const { data: oldSub, error: oldSubError } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .in("status", ["active", "trialing"])
    .maybeSingle()
    logQueryError("changeTier subscriptions", oldSubError)
  const oldTier = (oldSub?.tier ?? null) as Tier | null

  await supabase
    .from("subscriptions")
    .update({ tier: newTier, status: "active" })
    .eq("org_id", orgId)

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "subscriptions",
    record_id: orgId,
    action: "UPDATE",
    new_values: { action: "tier_changed", tier: newTier },
  })

  // Tier-change side-effects — the Owner→Steward+ identity fork is one (ADDENDUM_01C §5).
  if (oldTier) await onTierChanged(orgId, oldTier, newTier as Tier)

  return { success: true }
}

export { startTrial }
