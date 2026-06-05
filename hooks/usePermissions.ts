"use client"

/**
 * hooks/usePermissions.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
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
