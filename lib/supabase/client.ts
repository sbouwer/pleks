/**
 * lib/supabase/client.ts — Browser-side Supabase client (auth operations only)
 *
 * Notes: valid only for auth calls (signIn, mfa.*, getUser). Never use for
 *        DB queries — those go through gateway() which enforces org_id scoping.
 */
import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env"

// Singleton per browser tab (2026-06-01 DB-overload incident). Previously this returned a FRESH
// createBrowserClient on every call — and ~39 client components call it — so a session spun up many
// GoTrueClient instances, each with its own autoRefreshToken timer. Near token expiry they all
// refresh at once (a /token herd), and gotrue-js retries failed refreshes, so any lag self-amplifies
// into an auth flood. One instance per tab = one refresh timer, no lock contention. (Matches
// Supabase's own guidance + the "Multiple GoTrueClient instances detected" warning.)
let browserClient: SupabaseClient | undefined

export function createClient(): SupabaseClient {
  browserClient ??= createBrowserClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
  )
  return browserClient
}
