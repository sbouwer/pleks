"use client"

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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return null
      const { data, error } = await supabase
        .from("user_orgs")
        .select("role, is_admin")
        .eq("user_id", session.user.id)
        .is("deleted_at", null)
        .limit(1)
        .single()
      if (error) { console.error("usePermissions:", error.message); return null }
      return data as unknown as PermissionsData
    },
    staleTime: 5 * 60 * 1000,
  })

  const isOwner = data?.role === "owner"
  const isAdmin = isOwner || data?.is_admin === true

  return { isOwner, isAdmin, loaded: !isLoading }
}
