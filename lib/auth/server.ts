/**
 * lib/auth/server.ts — Cached per-request server auth helpers
 *
 * getServerUser()             — GoTrue-verified user (not cookie-spoofable; one round-trip per render tree)
 * getServerOrgMembership()    — org_id + role from pleks_org cookie (zero DB) or user_orgs DB fallback
 * getCurrentOrgCapabilities() — OrgCapabilities for the current org (ADDENDUM_61A — org-type-aware rendering)
 * requireAgentWriteAccess()   — Single chokepoint for all agent-side mutations (ADDENDUM_57G)
 */
import { cache } from "react"
import { cookies } from "next/headers"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { setSentryUser } from "@/lib/observability/user-context"
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/org/capabilities"
import type { OrgType } from "@/lib/constants"
import { gateway, type GatewayContext } from "@/lib/supabase/gateway"
import {
  canPerformAgentAction,
  SubscriptionLockdownError,
  type AgentWriteAction,
  type SubscriptionState,
  type SubscriptionStatus,
} from "@/lib/subscriptions/state"

/**
 * Cached per-request server auth helpers.
 * React.cache() deduplicates identical calls within a single SSR render tree.
 *
 * getServerUser() calls getUser() which verifies the token against GoTrue.
 * This is the Supabase-recommended approach on the server — avoids the
 * "insecure getSession()" warning and prevents spoofed cookie attacks.
 * The React.cache() wrapper ensures only one GoTrue round-trip per render tree.
 */

export const getServerUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * Org membership — cached per render tree.
 * Reads from the pleks_org cookie set by middleware (zero DB call on cache hit).
 * Falls back to a DB query on miss (e.g. first request after login).
 * Returns tier as already-resolved effective tier string (set by proxy.ts).
 *
 * NOTE: Never call cookieStore.set() here — Server Components cannot write cookies.
 * The middleware (proxy.ts) writes pleks_org after the user_orgs DB check.
 */
export const getServerOrgMembership = cache(async () => {
  const user = await getServerUser()
  if (!user) return null

  // 1. Try cookie (no DB call) — written by proxy.ts middleware
  const cookieStore = await cookies()
  const cached = cookieStore.get("pleks_org")
  if (cached?.value) {
    try {
      const parsed = JSON.parse(cached.value) as { org_id: string; role: string; tier?: string; user_id: string }
      if (parsed.org_id && parsed.role && parsed.user_id === user.id) {
        setSentryUser({ id: user.id, org_id: parsed.org_id, role: parsed.role })
        return { org_id: parsed.org_id, role: parsed.role, tier: parsed.tier ?? null }
      }
    } catch {
      // corrupted cookie — fall through to DB
    }
  }

  // 2. DB query (cookie miss — proxy.ts will refresh on next request)
  const supabase = await createClient()
  const { data } = await supabase
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (data) setSentryUser({ id: user.id, org_id: data.org_id, role: data.role })
  return data ? { ...data, tier: null } : null
})

/**
 * Org capabilities — cached per render tree (ADDENDUM_61A).
 * Resolves org type + name from DB, derives the full capability object.
 * Use in server components for redirect guards and capability-aware rendering.
 *
 * When §6.4 (cookie payload extension) ships, this can read type+name from
 * the pleks_org cookie to eliminate the DB round-trip. Until then it queries
 * once per render tree (React.cache deduplicates).
 */
export const getCurrentOrgCapabilities = cache(async (): Promise<OrgCapabilities | null> => {
  const membership = await getServerOrgMembership()
  if (!membership) return null

  // Fast path: pleks_org cookie carries type+name once proxy.ts §6.4 ships.
  const cookieStore = await cookies()
  const raw = cookieStore.get("pleks_org")?.value
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { type?: string; name?: string }
      if (parsed.type && parsed.name) {
        return getOrgCapabilities(parsed.type as OrgType, parsed.name)
      }
    } catch { /* fall through to DB */ }
  }

  // Slow path: DB query (cookie not yet populated — one round-trip, cached per render tree).
  const service = await createServiceClient()
  const { data: org, error } = await service
    .from("organisations")
    .select("type, name")
    .eq("id", membership.org_id)
    .single()

  if (error) {
    console.error("[getCurrentOrgCapabilities] query failed:", error.message)
    return null
  }
  if (!org) return null

  return getOrgCapabilities((org.type as OrgType) ?? "agency", org.name as string)
})

// ── ADDENDUM_57G — agent write gate ───────────────────────────────────────────

async function getSubscriptionState(orgId: string): Promise<SubscriptionState> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from("subscriptions")
    .select("status, past_due_since, paused_at, cancelled_at, purge_eligible_at")
    .eq("org_id", orgId)
    .single()

  if (error || !data) {
    // No subscription row = owner-free tier; treat as active for write purposes.
    return { status: "active", past_due_since: null, paused_at: null, cancelled_at: null, purge_eligible_at: null }
  }

  return {
    status:            (data.status as SubscriptionStatus) ?? "active",
    past_due_since:    data.past_due_since    ? new Date(data.past_due_since as string)    : null,
    paused_at:         data.paused_at         ? new Date(data.paused_at as string)         : null,
    cancelled_at:      data.cancelled_at      ? new Date(data.cancelled_at as string)      : null,
    purge_eligible_at: data.purge_eligible_at ? new Date(data.purge_eligible_at as string) : null,
  }
}

/**
 * Single chokepoint for all agent-side mutations (ADDENDUM_57G D-57G-08).
 * Call this instead of gateway() in any server action or route handler that writes.
 *
 * Throws SubscriptionLockdownError (HTTP 403) when the org is paused or cancelled.
 * Throws a plain Error when the user is not authenticated.
 *
 * Usage:
 *   const gw = await requireAgentWriteAccess("create_lease")
 *   // proceed — org is active and user is authenticated
 */
export async function requireAgentWriteAccess(
  action: AgentWriteAction,
): Promise<GatewayContext> {
  const gw = await gateway()
  if (!gw) throw new Error("Not authenticated")
  const sub = await getSubscriptionState(gw.orgId)
  const result = canPerformAgentAction(sub, action)
  if (!result.allowed) throw new SubscriptionLockdownError(result.reason, action)
  return gw
}

export type { AgentWriteAction, SubscriptionState } from "@/lib/subscriptions/state"
export type { GatewayContext } from "@/lib/supabase/gateway"
