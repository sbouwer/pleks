/**
 * hooks/useNavBadges.ts — sidebar nav badge counts (applications / maintenance / arrears awaiting attention)
 *
 * Auth:   browser Supabase client with the signed-in agent's session (RLS scopes counts to their org)
 * Data:   live COUNT(head) over applications / maintenance_requests / arrears_cases; 60s stale, 120s refetch
 * Notes:  applications badge = SUBMITTED + not-yet-triaged only (submitted_at NOT NULL, prescreened_by NULL,
 *         not archived). stage1_status="pre_screen_complete" alone also matches drafts that merely ran the free
 *         assessment without submitting — those must NOT show as a pending application.
 */
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
          .not("submitted_at", "is", null)
          .is("prescreened_by", null)
          .is("deleted_at", null),
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
