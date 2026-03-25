"use server"

import { createClient } from "@/lib/supabase/server"
import { addMonths } from "date-fns"
import type { Tier } from "@/lib/constants"

export async function convertTrialToSubscription(
  orgId: string,
  newTier: Exclude<Tier, "owner">,
  payfastToken: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const now = new Date()

  await supabase
    .from("subscriptions")
    .update({
      status: "active",
      tier: newTier,
      trial_converted: true,
      payfast_token: payfastToken,
      current_period_start: now.toISOString(),
      current_period_end: addMonths(now, 1).toISOString(),
    })
    .eq("org_id", orgId)

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "subscriptions",
    record_id: orgId,
    action: "UPDATE",
    new_values: {
      action: "trial_converted",
      tier: newTier,
      converted_at: now.toISOString(),
    },
  })

  return { success: true }
}
