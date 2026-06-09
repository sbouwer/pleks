"use client"

/**
 * hooks/useMyTeamIds.ts — the team ids the current agent belongs to (ADDENDUM_TEAMS Layer 1)
 *
 * Auth:   getMyTeamIds() server action (gateway); cached per session under ["my-team-ids"].
 * Data:   team_members for the current user. Feeds "My work" (team-assigned items count as mine) + the
 *         team filter. Empty for non-firm orgs (no teams) — a harmless no-op there.
 */
import { useQuery } from "@tanstack/react-query"
import { getMyTeamIds } from "@/lib/work/teams"

export function useMyTeamIds(): { teamIds: string[]; ready: boolean } {
  const { data } = useQuery({
    queryKey: ["my-team-ids"],
    queryFn: getMyTeamIds,
    staleTime: 5 * 60 * 1000,
  })
  return { teamIds: data ?? [], ready: !!data }
}
