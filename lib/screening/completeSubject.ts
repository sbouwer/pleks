/**
 * lib/screening/completeSubject.ts — mark a screening subject complete, once, and tell the others (14X N3)
 *
 * Data:   applications / application_co_applicants (searchworx_check_status) via the caller's service client,
 *         org-scoped; audit_log via recordAudit; N3 via lib/screening/milestoneNotices.ts.
 * Notes:  Moved out of the line runner's route so the transition can be probed (walker 14x-p4 F5). The write is guarded
 *         on not-yet-complete, so the transition is observable exactly once: N3 fires on it and nowhere else, and a
 *         re-entered settle tells nobody twice. Before 14X P4 the write was unguarded and its error unread — a failed
 *         write was silent and the orchestrator then ran on a stale status; it now throws for the runner to handle.
 *         A failed N3 never undoes a completion: notifyProgress reports its own send failures, and a roster read that
 *         throws is caught here.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { recordAudit } from "@/lib/audit/recordAudit"
import { isApplicationSubject, type ScreeningSubjectType } from "@/lib/screening/consentGuard"
import { notifyProgress } from "@/lib/screening/milestoneNotices"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** Returns true only when THIS call moved the subject to complete (and N3 was offered). */
export async function completeSubject(
  db: SupabaseClient,
  line: { org_id: string; application_id: string; subject_type: ScreeningSubjectType; subject_id: string },
  now: string,
): Promise<boolean> {
  const table = isApplicationSubject(line.subject_type) ? "applications" : "application_co_applicants"
  const rowId = isApplicationSubject(line.subject_type) ? line.application_id : line.subject_id

  // searchworx_run_started_at is cleared, not left behind: it is the sweep's input, and a completed
  // row that still carries a claim timestamp is a row the next schema change could re-strand.
  const { data: moved, error } = await db
    .from(table)
    .update({ searchworx_check_status: "complete", searchworx_checked_at: now, searchworx_run_started_at: null })
    .eq("id", rowId)
    .eq("org_id", line.org_id)
    .neq("searchworx_check_status", "complete")
    .select("id")
  if (error) {
    logQueryError(`completeSubject ${table}`, error)
    throw new Error(`mark complete failed on ${table} ${rowId}: ${error.message}`)
  }
  if (!moved?.length) return false

  await recordAudit(db, { orgId: line.org_id, table, recordId: rowId, action: "UPDATE", after: { searchworx_check_status: "complete", searchworx_checked_at: now } })

  await notifyProgress(db, {
    orgId: line.org_id, applicationId: line.application_id,
    completed: { subjectType: line.subject_type, subjectId: line.subject_id },
  }).catch((err: unknown) => Sentry.captureException(err, { tags: { milestone: "N3" }, extra: { application_id: line.application_id } }))
  return true
}
