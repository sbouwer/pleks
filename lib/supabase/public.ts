/**
 * lib/supabase/public.ts — anon Supabase client + site_content reader for unauthenticated public data
 *
 * Data:   site_content (anon publishable key, no session)
 * Notes:  ONLY for tables with USING(true) SELECT policies. Never use for org-scoped or authenticated data.
 */
import { createClient } from "@supabase/supabase-js"

/**
 * Anon Supabase client for reading public data (no auth required).
 * Only use for tables with USING(true) SELECT policies — e.g. site_content.
 * Never use for org-scoped or authenticated data.
 */
export function publicDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    { auth: { persistSession: false } }
  )
}

/**
 * Read editable public copy from site_content. BUILD-SAFE: a marketing page's static generation must never hang
 * on a slow/unreachable DB. The read is raced against a short timeout and falls back to {} (the page renders with
 * its default copy) instead of stalling `next build` to the 60s per-page SSG limit and failing the whole build.
 * (Incident 2026-07-07: the homepage SSG timed out 3× when Supabase was briefly unreachable, exiting the build.)
 */
const SITE_CONTENT_TIMEOUT_MS = 8000

export async function getSiteContent(): Promise<Record<string, string>> {
  try {
    const result = await Promise.race([
      publicDb().from("site_content").select("key, value"),
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(
          () => resolve({ data: null, error: { message: `timed out after ${SITE_CONTENT_TIMEOUT_MS}ms` } }),
          SITE_CONTENT_TIMEOUT_MS,
        ),
      ),
    ])
    const { data, error } = result
    if (error || !data) {
      console.error("getSiteContent failed (falling back to default copy):", error?.message ?? "no data")
      return {}
    }
    return Object.fromEntries(data.map(r => [r.key, r.value]))
  } catch (e) {
    console.error("getSiteContent threw (falling back to default copy):", e instanceof Error ? e.message : String(e))
    return {}
  }
}
