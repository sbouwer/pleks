/**
 * lib/supabase/server.ts — Server-side Supabase client factories
 *
 * createClient()             — cookie-based client; use only for auth.getUser(), never DB queries
 * createServiceClient()      — service-role client; bypasses RLS — every query must include org_id filter
 * getCachedServiceClient()   — React.cache() wrapper; deduplicates across one SSR render tree
 */
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { cache } from "react"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if middleware refreshes sessions.
          }
        },
      },
    }
  )
}

export async function createServiceClient() {
  const { createClient } = await import("@supabase/supabase-js")
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * React.cache()-wrapped service client — deduplicates across all dashboard helper
 * functions within a single SSR render tree (one import, one client per request).
 * Do NOT use in API routes or cron jobs — those have their own request scope.
 */
export const getCachedServiceClient = cache(async () => {
  const { createClient } = await import("@supabase/supabase-js")
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
})
