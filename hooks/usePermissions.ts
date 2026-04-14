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

      // Step 1: get role (always exists)
      const { data: base, error: baseErr } = await supabase
        .from("user_orgs")
        .select("role")
        .eq("user_id", session.user.id)
        .is("deleted_at", null)
        .limit(1)
        .single()
      if (baseErr || !base) return null

      const role = (base as unknown as { role: string }).role

      // Step 2: try is_admin — graceful fallback if column not yet migrated
      const { data: adminData } = await supabase
        .from("user_orgs")
        .select("is_admin")
        .eq("user_id", session.user.id)
        .is("deleted_at", null)
        .limit(1)
        .single()

      const is_admin = (adminData as unknown as { is_admin?: boolean } | null)?.is_admin ?? false

      return { role, is_admin }
    },
    staleTime: 5 * 60 * 1000,
  })

  const isOwner = data?.role === "owner"
  const isAdmin = isOwner || data?.is_admin === true

  return { isOwner, isAdmin, loaded: !isLoading }
}
