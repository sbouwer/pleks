import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

export interface NavBadges {
  applications: number
  maintenance: number
  arrears: number
}

export function useNavBadges(): NavBadges {
  const { data } = useQuery<NavBadges>({
    queryKey: ["nav-badges"],
    queryFn: async (): Promise<NavBadges> => {
      const supabase = createClient()
      const [apps, maint, arr] = await Promise.all([
        supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("stage1_status", "pre_screen_complete")
          .is("prescreened_by", null),
        supabase
          .from("maintenance_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending_review"),
        supabase
          .from("arrears_cases")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
      ])
      return {
        applications: apps.count ?? 0,
        maintenance: maint.count ?? 0,
        arrears: arr.count ?? 0,
      }
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
  return data ?? { applications: 0, maintenance: 0, arrears: 0 }
}
