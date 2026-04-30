/**
 * lib/supabase/client.ts — Browser-side Supabase client (auth operations only)
 *
 * Notes: valid only for auth calls (signIn, mfa.*, getUser). Never use for
 *        DB queries — those go through gateway() which enforces org_id scoping.
 */
import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
  )
}
