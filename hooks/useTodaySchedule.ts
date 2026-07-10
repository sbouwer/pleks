"use client"

/**
 * hooks/useTodaySchedule.ts — today's field-agent appointment list (the "On today" hero)
 *
 * Auth:   browser client — RLS scopes rows to the agent's org
 * Data:   inspections scheduled for the current local day, status scheduled/in_progress
 * Notes:  Times are derived from inspections.scheduled_date (timestamptz). Viewings/visits
 *         can be folded in here later — keep the ScheduleStop shape source-agnostic.
 */

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { fmtZA } from "@/lib/dates"

export interface ScheduleStop {
  id: string
  kind: "inspection"
  title: string // "Move-out inspection"
  location: string // "27 Twin Peaks · Unit 3"
  time: string // "14:00"
  scheduledAt: string // ISO
  href: string
}

export const INSPECTION_LABEL: Record<string, string> = {
  move_in: "Move-in inspection",
  periodic: "Periodic inspection",
  move_out: "Move-out inspection",
  pre_listing: "Pre-listing inspection",
  commercial_handover: "Commercial handover",
  commercial_dilapidations: "Dilapidations inspection",
}

export interface InspectionRow {
  id: string
  inspection_type: string
  scheduled_date: string | null
  units: { unit_number: string | null; properties: { name: string | null } | null } | null
}

/** Map a raw inspection row to a source-agnostic schedule stop. */
export function inspectionToStop(r: InspectionRow): ScheduleStop {
  const unit = r.units
  const propertyName = unit?.properties?.name ?? "Property"
  const unitNo = unit?.unit_number ? `Unit ${unit.unit_number}` : null
  const when = r.scheduled_date ? new Date(r.scheduled_date) : null
  return {
    id: r.id,
    kind: "inspection",
    title: INSPECTION_LABEL[r.inspection_type] ?? "Inspection",
    location: [propertyName, unitNo].filter(Boolean).join(" · "),
    time: when ? fmtZA(when, { hour: "2-digit", minute: "2-digit" }) : "—",
    scheduledAt: r.scheduled_date ?? "",
    href: `/inspections/${r.id}`,
  }
}

export function useTodaySchedule(): { stops: ScheduleStop[]; isLoading: boolean } {
  const supabase = createClient()

  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)

  const { data = [], isLoading } = useQuery<ScheduleStop[]>({
    queryKey: ["mobile-today-schedule", dayStart.toISOString()],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("inspections")
        .select("id, inspection_type, scheduled_date, units(unit_number, properties(name))")
        .gte("scheduled_date", dayStart.toISOString())
        .lt("scheduled_date", dayEnd.toISOString())
        .in("status", ["scheduled", "in_progress"])
        .order("scheduled_date", { ascending: true })

      if (error) {
        console.error("useTodaySchedule:", error.message)
        return []
      }

      return ((rows ?? []) as unknown as InspectionRow[]).map(inspectionToStop)
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  return { stops: data, isLoading }
}
