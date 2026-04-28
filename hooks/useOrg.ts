"use client"

/**
 * hooks/useOrg.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { getOrgDisplayName, type OrgNameFields } from "@/lib/org/displayName"

export function useOrg() {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ["org"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return null
      const { data } = await supabase
        .from("user_orgs")
        .select("org_id, role, organisations(*)")
        .eq("user_id", session.user.id)
        .is("deleted_at", null)
        .limit(1)
        .single()
      return data
    },
    staleTime: 5 * 60 * 1000,
  })

  const org = (data?.organisations as unknown as Record<string, unknown>) ?? null
  const role = data?.role ?? null
  const displayName = org ? getOrgDisplayName(org as unknown as OrgNameFields) : null

  return { org, orgId: data?.org_id ?? null, role, displayName, loading: isLoading }
}
