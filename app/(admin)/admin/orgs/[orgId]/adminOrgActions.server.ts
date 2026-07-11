"use server"

/**
 * app/(admin)/admin/orgs/[orgId]/adminOrgActions.server.ts — admin server actions on a single org
 *
 * Auth:   requireAdminAuth() asserted IN every action — server actions are directly POSTable, so
 *         the (admin) route-group HMAC gate is NOT sufficient on its own. Service client used here.
 * Data:   organisations, subscriptions, audit_log
 * Notes:  changeTier fires onTierChanged (ADDENDUM_01C §4) AFTER the subscriptions write — the
 *         Owner→Steward+ identity fork hangs off that hook. startTrial is re-exported through a
 *         gated wrapper (the raw lib fn is a "use server" export → would otherwise be ungated).
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { startTrial as startTrialImpl } from "@/lib/trial/startTrial"
import { onTierChanged } from "@/lib/tier/onTierChanged"
import type { Tier } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

export async function activateFoundingAgent(orgId: string) {
  await requireAdminAuth()
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

  await recordAudit(supabase, { orgId: orgId, table: "organisations", recordId: orgId, action: "UPDATE", after: { action: "founding_agent_activated" } })

  return { success: true }
}

export async function changeTier(orgId: string, newTier: string) {
  await requireAdminAuth()
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

  await recordAudit(supabase, { orgId: orgId, table: "subscriptions", recordId: orgId, action: "UPDATE", after: { action: "tier_changed", tier: newTier } })

  // Tier-change side-effects — the Owner→Steward+ identity fork is one (ADDENDUM_01C §5).
  if (oldTier) await onTierChanged(orgId, oldTier, newTier as Tier)

  return { success: true }
}

/** Gated wrapper — the raw lib fn is a "use server" export and must not be reachable ungated. */
export async function startTrial(
  orgId: string,
  trialTier: "steward" | "portfolio" | "firm" = "steward"
) {
  await requireAdminAuth()
  return startTrialImpl(orgId, trialTier)
}
