import { cache } from "react"
import { createClient } from "@/lib/supabase/server"

/**
 * Cached per-request server auth helpers.
 * React.cache() deduplicates identical calls within a single SSR render tree,
 * so multiple server components on the same page share one network round-trip.
 */

export const getServerUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getServerOrgMembership = cache(async () => {
  const user = await getServerUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  return data ?? null
})
