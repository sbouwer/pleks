import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

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

  return data ? { ...data, tier: null } : null
})
