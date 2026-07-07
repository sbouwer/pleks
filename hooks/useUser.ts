"use client"

/**
 * hooks/useUser.ts — current authenticated user via Supabase auth (react-query cached)
 *
 * Data:   supabase.auth.getUser() (client)
 */
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

export function useUser() {
  const supabase = createClient()

  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
    staleTime: 5 * 60 * 1000,
  })

  return { user: user ?? null, loading: isLoading }
}
