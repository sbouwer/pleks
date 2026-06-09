"use client"

/**
 * hooks/useMyTeams.ts — the current agent's active teams (ADDENDUM_TEAMS Layer 1)
 *
 * Auth:   getMyTeams() server action (gateway); cached per session under ["my-teams"].
 * Data:   team_members → teams (id + name) for the current user. Feeds "My work" (team-assigned items count
 *         as mine, via teamIds) + the per-team View filter (named options). Empty on non-firm orgs.
 */
import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { getMyTeams } from "@/lib/work/teams"

export function useMyTeams(): { teams: { id: string; name: string }[]; teamIds: string[]; ready: boolean } {
  const { data } = useQuery({
    queryKey: ["my-teams"],
    queryFn: getMyTeams,
    staleTime: 5 * 60 * 1000,
  })
  return useMemo(() => {
    const teams = data ?? []
    return { teams, teamIds: teams.map((t) => t.id), ready: !!data }
  }, [data])
}
