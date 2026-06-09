"use server"

/**
 * lib/dev/devSubStatus.ts — DEV-ONLY: force the current org's subscription status (REMOVE BEFORE LAUNCH)
 *
 * Auth:   hard-gated to DEV_TIER_EMAIL server-side.
 * Data:   writes subscriptions.status (+ paused_at / cancelled_at) so you can exercise the dunning/lockdown
 *         states — past_due (advisory), paused / cancelled (requireAgentWriteAccess blocks new writes) — to
 *         test access + CRUD restrictions and the header subscription bell. Find-or-create the sub row.
 * Notes:  Bypasses the free-tier pause guard on purpose (it's a test switch). Delete lib/dev/ to remove.
 */
import { gateway } from "@/lib/supabase/gateway"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { DEV_TIER_EMAIL } from "./devTierConfig"

export type DevSubStatus = "active" | "past_due" | "paused" | "cancelled"

export async function devSetSubStatus(status: DevSubStatus): Promise<{ ok: true } | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user || (user.email ?? "").toLowerCase() !== DEV_TIER_EMAIL) return { error: "Not allowed" }

  const service = await createServiceClient()
  const now = new Date().toISOString()

  const patch: Record<string, unknown> = { status, paused_at: null, pause_reason: null, cancelled_at: null, pending_cancellation_since: null }
  if (status === "paused") { patch.paused_at = now; patch.pause_reason = "dev test" }
  else if (status === "cancelled") { patch.cancelled_at = now }

  const { data: existing, error: readErr } = await service
    .from("subscriptions").select("id").eq("org_id", gw.orgId).not("status", "in", "(purged)").limit(1).maybeSingle()
  if (readErr) return { error: readErr.message }

  if (existing?.id) {
    const { error } = await service.from("subscriptions").update(patch).eq("id", existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await service.from("subscriptions").insert({ org_id: gw.orgId, tier: "owner", ...patch })
    if (error) return { error: error.message }
  }
  return { ok: true }
}
