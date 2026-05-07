"use client"

/**
 * hooks/useOrg.ts — Client hook returning the current user's org record and subscription status
 *
 * Data:   user_orgs + organisations(*) + subscriptions(status) via anon Supabase client
 * Notes:  subscriptionStatus feeds useOrgCapabilities → isLockedDown (ADDENDUM_57G).
 *         RLS: sub_members_select allows org members to read their own subscription row.
 */
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { getOrgDisplayName, type OrgNameFields } from "@/lib/org/displayName"
import type { SubscriptionStatus } from "@/lib/subscriptions/state"

export function useOrg() {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ["org"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return null
      const { data: orgData } = await supabase
        .from("user_orgs")
        .select("org_id, role, organisations(*)")
        .eq("user_id", session.user.id)
        .is("deleted_at", null)
        .limit(1)
        .single()
      if (!orgData) return null
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("status, cancelled_at")
        .eq("org_id", orgData.org_id)
        .not("status", "eq", "purged")
        .maybeSingle()
      return {
        ...orgData,
        subscriptionStatus: (subData?.status ?? "active") as SubscriptionStatus,
        cancelledAt: (subData?.cancelled_at as string | null) ?? null,
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const org = (data?.organisations as unknown as Record<string, unknown>) ?? null
  const role = data?.role ?? null
  const displayName = org ? getOrgDisplayName(org as unknown as OrgNameFields) : null

  return {
    org,
    orgId: data?.org_id ?? null,
    role,
    displayName,
    subscriptionStatus: data?.subscriptionStatus ?? "active" as SubscriptionStatus,
    cancelledAt: data?.cancelledAt ?? null,
    loading: isLoading,
  }
}
