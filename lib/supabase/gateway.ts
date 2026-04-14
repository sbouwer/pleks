/**
 * Authenticated gateway — single entry point for every server action and
 * server-side data fetch that needs DB access.
 *
 * WHY THIS EXISTS:
 * The cookie-based Supabase client (`createClient`) reliably verifies
 * auth tokens via `auth.getUser()`, but its session does NOT propagate
 * to Postgres RLS policies (`auth.uid()` returns null in many contexts).
 * This caused silent empty results across maintenance forms, lease lists,
 * consent log, and every client-side React Query fetch.
 *
 * THE PATTERN:
 * 1. Verify the user via `createClient().auth.getUser()` (works reliably)
 * 2. Resolve org membership via cookie or DB fallback
 * 3. Return a service-role client for actual data queries
 * 4. Every query MUST filter by `orgId` — RLS is not protecting you here
 *
 * USAGE:
 *   const gw = await gateway()
 *   if (!gw) redirect("/login")
 *   const { db, userId, orgId } = gw
 *   const { data } = await db.from("units").select("*").eq("org_id", orgId)
 */

import { cache } from "react"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface GatewayContext {
  /** Service-role Supabase client — bypasses RLS. Always filter by orgId. */
  db: SupabaseClient
  /** Authenticated user ID (verified via GoTrue) */
  userId: string
  /** User's email */
  email: string
  /** Organisation ID from pleks_org cookie or DB fallback */
  orgId: string
  /** User's role within the org */
  role: string
  /** Org tier (may be null if cookie doesn't include it) */
  tier: string | null
  /** True if user is owner OR has is_admin = true. Use this for destructive/admin-only actions. */
  isAdmin: boolean
}

/**
 * Gateway for server actions — NOT cached (server actions are one-shot).
 * Returns null if the user is not authenticated or has no org membership.
 */
export async function gateway(): Promise<GatewayContext | null> {
  // 1. Verify auth via cookie client (this always works)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 2. Resolve org membership — cookie first, DB fallback
  const membership = await resolveOrgMembership(user.id)
  if (!membership) return null

  // 3. Return service client for data operations
  const db = await createServiceClient()

  return {
    db,
    userId: user.id,
    email: user.email ?? "",
    orgId: membership.org_id,
    role: membership.role,
    tier: membership.tier,
    isAdmin: membership.role === "owner" || membership.is_admin === true,
  }
}

/**
 * Gateway for server components — React.cache() wrapped so multiple
 * calls within the same render tree share one auth check + one service client.
 */
export const gatewaySSR = cache(async (): Promise<GatewayContext | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const membership = await resolveOrgMembership(user.id)
  if (!membership) return null

  // Use cached service client for SSR (deduplicates across render tree)
  const { createClient: createSupa } = await import("@supabase/supabase-js")
  const db = createSupa(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  return {
    db,
    userId: user.id,
    email: user.email ?? "",
    orgId: membership.org_id,
    role: membership.role,
    tier: membership.tier,
    isAdmin: membership.role === "owner" || membership.is_admin === true,
  }
})

// ── Internal ──────────────────────────────────────────────────────────

async function resolveOrgMembership(
  userId: string
): Promise<{ org_id: string; role: string; tier: string | null; is_admin: boolean } | null> {
  // 1. Try pleks_org cookie (zero DB call)
  // Note: is_admin is NOT cached in the cookie — always false from cookie path.
  // Owners are always isAdmin regardless (role === 'owner' check covers them).
  // Non-owners get is_admin from the DB fallback path.
  const cookieStore = await cookies()
  const cached = cookieStore.get("pleks_org")
  if (cached?.value) {
    try {
      const parsed = JSON.parse(cached.value) as {
        org_id: string
        role: string
        tier?: string
        user_id: string
      }
      if (parsed.org_id && parsed.role && parsed.user_id === userId) {
        return {
          org_id: parsed.org_id,
          role: parsed.role,
          tier: parsed.tier ?? null,
          is_admin: parsed.role === "owner", // owner always admin; others resolved at DB level
        }
      }
    } catch {
      // corrupted cookie — fall through
    }
  }

  // 2. DB fallback (service client to avoid RLS issues)
  const service = await createServiceClient()
  const { data } = await service
    .from("user_orgs")
    .select("org_id, role, is_admin")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .single()

  if (!data) return null
  return {
    org_id: data.org_id,
    role: data.role,
    tier: null,
    is_admin: (data as unknown as { is_admin: boolean }).is_admin ?? false,
  }
}
