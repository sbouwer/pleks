"use server"

/**
 * lib/trial/startTrial.ts — start a 14-day trial for an org (admin-initiated)
 *
 * Auth:   internal — reached ONLY via the requireAdminAuth() wrapper in adminOrgActions.server.ts
 *         (the client imports that wrapper, never this lib fn), so it is not a client-callable action.
 * Data:   subscriptions (read + update, org-scoped by the caller-supplied orgId), audit_log. Service client.
 * Notes:  Caller-verified gated (#124 census). orgId is supplied by the admin acting on the target org.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { addDays } from "date-fns"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

export async function startTrial(
  orgId: string,
  trialTier: "steward" | "portfolio" | "firm" = "steward"
): Promise<{ success: boolean; trialEndsAt?: string; error?: string }> {
  const service = await createServiceClient()

  // Check if already trialing or on a paid plan
  const { data: existing, error: existingError } = await service
    .from("subscriptions")
    .select("status, tier, trial_ends_at")
    .eq("org_id", orgId)
    .single()
  logQueryError("startTrial subscriptions", existingError)

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

  await service
    .from("subscriptions")
    .update({
      status: "trialing",
      trial_tier: trialTier,
      trial_starts_at: now.toISOString(),
      trial_ends_at: trialEnd.toISOString(),
    })
    .eq("org_id", orgId)

  await recordAudit(service, { orgId: orgId, table: "subscriptions", recordId: orgId, action: "UPDATE", after: {
      action: "trial_started",
      trial_tier: trialTier,
      trial_ends_at: trialEnd.toISOString(),
    } })

  return { success: true, trialEndsAt: trialEnd.toISOString() }
}
