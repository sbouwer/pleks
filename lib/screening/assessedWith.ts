/**
 * lib/screening/assessedWith.ts — which parties a FitScore was computed on, and out of how many (14X §4, rows 35–36)
 *
 * Data:   pure; reads nothing. The orchestrator hands it the application's co rows.
 * Notes:  N is the lead plus every co party that is live (not declined) AND whose line completed. M is the lead plus
 *         EVERY co row on the application, declined or not: the excluded rows are the "of M − N" (row 35).
 *         Deliberately not an allowlist of decline reasons (walker 14x-p3 F2). As read at 2e270f2d, the only writer of
 *         application_co_applicants.declined_at is the 14X cron's deadline decline, and the only removal is the POPIA
 *         purge — so every row here is a party who was asked and did or did not complete. A future path that REMOVES
 *         a party from the application (rather than declining one who ran out of time) must exclude itself here; until
 *         it does, M over-counts and the stamp reads as incomplete — never as a complete assessment it was not. Nor is
 *         `decline_reason` read: that column is marked deprecated, to be dropped.
 *         Kept out of fitScoreEngine.v1.ts on purpose: that file is frozen post-ship (its header), and this stamp
 *         changes no score — it describes the input set the score was computed on.
 */

/** Persisted on fitscore_component_snapshot as `assessedWith`. Subject ids are applications.id for the lead and
 *  application_co_applicants.id for a co party — the same ids as componentSnapshot.applicants[].id. */
export interface AssessedWith {
  n: number
  m: number
  completedSubjectIds: string[]
}

export interface RosterCoRow {
  id: string
  declined_at: string | null
  searchworx_check_status: string | null
}

/** Split an application's co rows into the ones the score is computed on, and the count of co parties it is OUT OF. */
export function screeningRoster<T extends RosterCoRow>(rows: T[]): { completed: T[]; counted: number } {
  const completed = rows.filter(r => r.declined_at === null && r.searchworx_check_status === "complete")
  return { completed, counted: rows.length }
}

/** The stamp: the lead always counts in both (the orchestrator runs only once the lead's line is complete). */
export function stampAssessedWith(leadId: string, completedCoIds: string[], countedCos: number): AssessedWith {
  if (countedCos < completedCoIds.length) {
    throw new Error(`assessedWith: ${completedCoIds.length} completed co parties out of only ${countedCos}`)
  }
  return { n: 1 + completedCoIds.length, m: 1 + countedCos, completedSubjectIds: [leadId, ...completedCoIds] }
}

/** Same stamp: the same counts over the same parties, in the same order (the order the engine scored them in). */
export function sameAssessedWith(a: AssessedWith | null, b: AssessedWith | null): boolean {
  if (!a || !b) return a === b
  return a.n === b.n && a.m === b.m && a.completedSubjectIds.join("\u0000") === b.completedSubjectIds.join("\u0000")
}

/** Read the stamp back off a stored snapshot. Null for a snapshot written before 14X P3, which carries none. */
export function readAssessedWith(snapshot: unknown): AssessedWith | null {
  const raw = (snapshot as { assessedWith?: unknown } | null)?.assessedWith as Partial<AssessedWith> | undefined
  if (!raw || typeof raw.n !== "number" || typeof raw.m !== "number" || !Array.isArray(raw.completedSubjectIds)) return null
  return { n: raw.n, m: raw.m, completedSubjectIds: raw.completedSubjectIds.filter((s): s is string => typeof s === "string") }
}
