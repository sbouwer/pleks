"use server"

import { createClient } from "@/lib/supabase/server"
import { addDays } from "date-fns"

export async function startTrial(
  orgId: string,
  trialTier: "steward" | "portfolio" | "firm" = "steward"
): Promise<{ success: boolean; trialEndsAt?: string; error?: string }> {
  const supabase = await createClient()

  // Check if already trialing or on a paid plan
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("status, tier, trial_ends_at")
    .eq("org_id", orgId)
    .single()

  if (existing?.status === "trialing") {
    return { success: false, error: "Trial already active" }
  }

  if (existing?.tier !== "owner") {
    return { success: false, error: "Already on a paid plan" }
  }

  // Check if they've already had a trial (prevent abuse)
  if (existing?.trial_ends_at) {
    return { success: false, error: "Trial already used for this organisation" }
  }

  const now = new Date()
  const trialEnd = addDays(now, 14)

  await supabase
    .from("subscriptions")
    .update({
      status: "trialing",
      trial_tier: trialTier,
      trial_starts_at: now.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
    })
    .eq("org_id", orgId)

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "subscriptions",
    record_id: orgId,
    action: "UPDATE",
    new_values: {
      action: "trial_started",
      trial_tier: trialTier,
      trial_ends_at: trialEnd.toISOString(),
    },
  })

  return { success: true, trialEndsAt: trialEnd.toISOString() }
}
