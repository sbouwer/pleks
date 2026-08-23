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
    // Purged rows are history. `subscriptions.org_id` has an INDEX, not a unique constraint
    // (001_foundation.sql:265), so an org purged and then resubscribed holds two rows and `.single()`
    // errored — which read here as "no subscription at all" and refused the trial with the confidently
    // wrong reason "Already on a paid plan".
    .not("status", "eq", "purged")
    .maybeSingle()
  logQueryError("startTrial subscriptions", existingError)
  // An unread row cannot clear the trial-abuse checks below — every one of them is phrased as
  // "unless we can see a reason not to", so a null `existing` silently satisfies all three.
  if (existingError) {
    return { success: false, error: "Could not read the current subscription — try again" }
  }

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
