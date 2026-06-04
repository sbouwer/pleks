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

/** Fail-fast budget for the auth/membership lookup. A throttled DB must not hang the
 *  request for minutes — surface it fast so an error boundary (not a logout) shows. */
const GATEWAY_DB_TIMEOUT_MS = 8000

/** Thrown when the membership lookup fails for a TRANSIENT reason (timeout, connection,
 *  throttle) — as opposed to the user genuinely having no org. Callers/error boundaries can
 *  treat this as "service unavailable, retry", NOT "logged out". Distinguishing the two is
 *  what stops a slow DB from bouncing an authenticated user to /login. */
export class GatewayUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GatewayUnavailableError"
  }
}

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

type Membership = { org_id: string; role: string; tier: string | null; is_admin: boolean }

async function resolveOrgMembership(userId: string): Promise<Membership | null> {
  const service = await createServiceClient()

  // 1. Cookie org_id hint — validated against the DB (the cookie is a cache hint, never a
  //    trust source for org_id/role). Returns membership, or null to fall through.
  const fromCookie = await resolveFromCookieHint(service, userId)
  if (fromCookie) return fromCookie

  // 2. DB fallback — no valid cookie hint, query directly.
  const { data, error } = await service
    .from("user_orgs")
    .select("org_id, role, is_admin")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .abortSignal(AbortSignal.timeout(GATEWAY_DB_TIMEOUT_MS))
    .single()

  if (error) {
    // PGRST116 = "no rows" → user genuinely has no org → null (→ login is correct).
    // Anything else (timeout, connection, throttle) is transient → throw so the request
    // surfaces an error boundary instead of bouncing an authenticated user to /login.
    if (error.code === "PGRST116") return null
    throw new GatewayUnavailableError(error.message)
  }
  if (!data) return null
  return {
    org_id: data.org_id,
    role: data.role,
    tier: null,
    is_admin: data.is_admin ?? false,
  }
}

/**
 * Validate the pleks_org cookie hint against the DB. Returns membership when the cookie's
 * org is valid for this user, or null to fall through to a full DB lookup (corrupted cookie,
 * mismatched user, or org not a member). Throws GatewayUnavailableError on a TRANSIENT DB
 * failure so a slow DB is never misread as "no org".
 */
async function resolveFromCookieHint(service: SupabaseClient, userId: string): Promise<Membership | null> {
  const cookieStore = await cookies()
  const cached = cookieStore.get("pleks_org")
  if (!cached?.value) return null

  let parsed: { org_id?: string; tier?: string; user_id?: string }
  try {
    parsed = JSON.parse(cached.value)
  } catch {
    return null // corrupted cookie — fall through to DB lookup
  }
  if (!parsed.org_id || parsed.user_id !== userId) return null

  const { data: membership, error } = await service
    .from("user_orgs")
    .select("role, is_admin")
    .eq("user_id", userId)
    .eq("org_id", parsed.org_id)
    .is("deleted_at", null)
    .abortSignal(AbortSignal.timeout(GATEWAY_DB_TIMEOUT_MS))
    .maybeSingle()

  // A real query error (timeout/throttle) is NOT "no membership" — maybeSingle() returns no
  // error for 0 rows, so any error here is transient.
  if (error) throw new GatewayUnavailableError(error.message)
  if (!membership) return null // claimed org not a current membership — fall through

  const m = membership as unknown as { role: string; is_admin: boolean }
  return {
    org_id: parsed.org_id,
    role: m.role,
    tier: parsed.tier ?? null,
    is_admin: m.role === "owner" || m.is_admin === true,
  }
}
