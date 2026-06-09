/**
 * lib/work/myWorkFilter.ts — the per-agent "my work" resolution (ADDENDUM_TEAMS_ASSIGNMENT_MODEL, Layer 0)
 *
 * Notes:  The load-bearing routing predicate (D-4), built once + reused on every work queue. Kept a FLAT
 *         indexed column-eq (`assigned_user_id = me`) — never a PostgREST cross-table OR/join. Items default
 *         their assignee to the creating agent at create (D-12), so "mine" is just the column match.
 *         A NULL assignee = the Everyone/Org shared bucket (D-11/12): not "mine", surfaced under "All".
 *         `teamIds` is reserved for Phase 2 (firm named teams add `assigned_team_id IN myTeamIds`); it is a
 *         no-op in Phase 1.
 */

/** Work-list scope. Phase 2 will add `team:${teamId}`. */
export type WorkScope = "mine" | "all"

export const DEFAULT_WORK_SCOPE: WorkScope = "mine"

/** Narrow a string to a valid WorkScope (e.g. from a search param), defaulting to "mine". */
export function parseWorkScope(value: string | null | undefined): WorkScope {
  return value === "all" ? "all" : "mine"
}

/** Minimal shape of a Supabase filter builder — just the chainable `.eq` we need. */
interface EqFilterable<Q> {
  eq: (column: string, value: unknown) => Q
}

/**
 * Apply the work scope to a Supabase query builder.
 * - "mine" → `assigned_user_id = userId` (flat indexed eq).
 * - "all"  → unchanged (org-scope only; includes Everyone/Org null-assignee items + everyone else's).
 * `teamIds` is a Phase-1 no-op (Phase 2 adds the team branch).
 */
export function applyWorkScope<Q extends EqFilterable<Q>>(
  query: Q,
  scope: WorkScope,
  userId: string,
  _teamIds: readonly string[] = [],
): Q {
  if (scope === "mine") return query.eq("assigned_user_id", userId)
  return query
}

/** Client-side predicate for an already-loaded list. "Mine" = assigned to me OR to a team I'm on
 *  (ADDENDUM_TEAMS Layer 1); null/null = Everyone/Org (not mine). teamIds is empty on non-firm orgs. */
export function isMine(
  item: { assigned_user_id: string | null; assigned_team_id?: string | null },
  userId: string,
  teamIds: readonly string[] = [],
): boolean {
  if (item.assigned_user_id === userId) return true
  return item.assigned_team_id != null && teamIds.includes(item.assigned_team_id)
}
