import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

/**
 * Cached per-request server auth helpers.
 * React.cache() deduplicates identical calls within a single SSR render tree.
 *
 * getSession()  — reads JWT from cookie, zero network call.
 *   Safe for page loads: RLS validates the JWT on every PostgREST query anyway.
 *   The only thing getUser() adds is checking GoTrue for token revocation —
 *   a rare event (admin manually disabling a user) with a 1-hour impact window.
 *
 * getServerUserVerified() — makes a network call to GoTrue.
 *   Use ONLY for sensitive writes: password change, email change, payments.
 */

export const getServerSession = cache(async () => {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
})

export const getServerUser = cache(async () => {
  const session = await getServerSession()
  return session?.user ?? null
})

/** Network call to GoTrue — use only for sensitive operations. */
export const getServerUserVerified = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * Org membership — cached per render tree.
 * Reads from the pleks_org cookie set by middleware (zero DB call on cache hit).
 * Falls back to a DB query on miss (e.g. first request after login).
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
      const parsed = JSON.parse(cached.value) as { org_id: string; role: string; user_id: string }
      if (parsed.org_id && parsed.role && parsed.user_id === user.id) {
        return { org_id: parsed.org_id, role: parsed.role }
      }
    } catch {
      // corrupted cookie — fall through to DB
    }
  }

  // 2. DB query (cookie miss — proxy.ts will set it on the next request)
  const supabase = await createClient()
  const { data } = await supabase
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  return data ?? null
})
