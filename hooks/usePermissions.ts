"use client"

/**
 * hooks/usePermissions.ts — resolves the current user's owner/admin flags for the active org
 *
 * Data:   user_orgs.role + is_admin for the authed user (client, RLS-scoped)
 * Notes:  owner implies admin; no membership (onboarding) returns null rather than erroring
 */
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

interface PermissionsData {
  role: string
  is_admin: boolean
}

export function usePermissions() {
  const supabase = createClient()

  const { data, isLoading } = useQuery<PermissionsData | null>({
    queryKey: ["permissions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data: row, error } = await supabase
        .from("user_orgs")
        .select("role, is_admin")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle()   // no membership (onboarding) is normal — don't manufacture a PGRST116
      if (error || !row) return null

      const { role, is_admin } = row as { role: string; is_admin: boolean }
      return { role, is_admin: is_admin ?? false }
    },
    staleTime: 5 * 60 * 1000,
  })

  const isOwner = data?.role === "owner"
  const isAdmin = isOwner || data?.is_admin === true

  return { isOwner, isAdmin, loaded: !isLoading }
}
