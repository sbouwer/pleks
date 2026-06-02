"use client"

/**
 * hooks/useUpcomingSchedule.ts — the agent's upcoming agenda (mobile Schedule sheet)
 *
 * Auth:   browser client — RLS scopes rows to the agent's org
 * Data:   inspections from start-of-today forward, status scheduled/in_progress
 * Notes:  All-tier (the paid Operations Calendar gates the /calendar PAGE, not this data). Returns a
 *         flat, time-ordered ScheduleStop list — the sheet groups it by day.
 */

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { inspectionToStop, type InspectionRow, type ScheduleStop } from "@/hooks/useTodaySchedule"

const DEFAULT_DAYS = 30

export function useUpcomingSchedule(days: number = DEFAULT_DAYS): { stops: ScheduleStop[]; isLoading: boolean } {
  const supabase = createClient()

  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const horizon = new Date(dayStart.getTime() + days * 86_400_000)

  const { data = [], isLoading } = useQuery<ScheduleStop[]>({
    queryKey: ["mobile-upcoming-schedule", dayStart.toISOString(), days],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("inspections")
        .select("id, inspection_type, scheduled_date, units(unit_number, properties(name))")
        .gte("scheduled_date", dayStart.toISOString())
        .lt("scheduled_date", horizon.toISOString())
        .in("status", ["scheduled", "in_progress"])
        .order("scheduled_date", { ascending: true })

      if (error) {
        console.error("useUpcomingSchedule:", error.message)
        return []
      }

      return ((rows ?? []) as unknown as InspectionRow[]).map(inspectionToStop)
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  return { stops: data, isLoading }
}
