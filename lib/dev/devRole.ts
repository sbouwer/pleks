"use server"

/**
 * lib/dev/devRole.ts — DEV-ONLY: switch the current user's role in their org (REMOVE BEFORE LAUNCH)
 *
 * Auth:   hard-gated to DEV_TIER_EMAIL server-side — anyone else gets "Not allowed".
 * Data:   writes user_orgs.role (+ is_admin) for the caller, then clears the pleks_org cookie so middleware
 *         re-hydrates the role from the DB on reload (it's the role-bearing cache gateway/can() read).
 * Notes:  Lets the dev exercise role/capability gating as any role. 'owner' restores full access; any other
 *         role drops is_admin so getMyCapabilities reflects that role's capabilities (else is_admin → all).
 *         To remove: delete lib/dev/, components/dev/DevTierToggle, and the TopBar line.
 */
import { cookies } from "next/headers"
import { gateway } from "@/lib/supabase/gateway"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { DEV_TIER_EMAIL } from "./devTierConfig"

export async function devSetRole(role: string): Promise<{ ok: true } | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user || (user.email ?? "").toLowerCase() !== DEV_TIER_EMAIL) return { error: "Not allowed" }

  const slug = role.trim()
  if (!slug) return { error: "No role" }

  const service = await createServiceClient()
  const isOwner = slug === "owner"
  const { error } = await service
    .from("user_orgs")
    .update({ role: slug, is_admin: isOwner })
    .eq("user_id", user.id)
    .eq("org_id", gw.orgId)
    .is("deleted_at", null)
  if (error) return { error: error.message }

  // Clear BOTH cached org cookies so middleware re-reads the role from the DB on the reload. pleks_has_org
  // (7-day) also carries the role, so leaving it would repopulate pleks_org with the stale role.
  const jar = await cookies()
  jar.delete("pleks_org")
  jar.delete("pleks_has_org")
  return { ok: true }
}
