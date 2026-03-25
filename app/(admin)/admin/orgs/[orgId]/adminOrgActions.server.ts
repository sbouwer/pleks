"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { startTrial } from "@/lib/trial/startTrial"

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

  return { success: true }
}

export { startTrial }
