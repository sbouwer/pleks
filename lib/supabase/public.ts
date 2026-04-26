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

export async function getSiteContent(): Promise<Record<string, string>> {
  const { data, error } = await publicDb()
    .from("site_content")
    .select("key, value")

  if (error || !data) return {}
  return Object.fromEntries(data.map(r => [r.key, r.value]))
}
