"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "./useUser"
import { getOrgDisplayName, type OrgNameFields } from "@/lib/org/displayName"

export function useOrg() {
  const { user } = useUser()
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ["org", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_orgs")
        .select("org_id, role, organisations(*)")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .limit(1)
        .single()
      return data
    },
    enabled: !!user,
  })

  const org = (data?.organisations as unknown as Record<string, unknown>) ?? null
  const role = data?.role ?? null
  const displayName = org ? getOrgDisplayName(org as unknown as OrgNameFields) : null

  return { org, orgId: data?.org_id ?? null, role, displayName, loading: isLoading }
}
