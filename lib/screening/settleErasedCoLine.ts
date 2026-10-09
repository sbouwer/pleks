/**
 * lib/screening/settleErasedCoLine.ts — take an erased co party's screening line out of the set, and run nothing on it
 *
 * Auth:   none — server-only; callers are the screening-portal-reminders cron and the screening-line-runner (service client)
 * Data:   application_co_applicants (declined_at, decline_reason), audit_log
 * Notes:  An erased co keeps `declined_at` null (the strip leaves no column of its own — lib/applications/liveCoParties.ts),
 *         so `v_application_screening_lines` keeps its line, and nothing that waits on that line ever moves again: the
 *         reminders cron would hold it until a deadline, and once it was paid and consented the line-runner screened a
 *         subject with no ID number, failed it for a person, and left the group's FitScore stranded (N3 re-walk R1b).
 *
 *         The subject has left. Its line is settled NOW, whatever its state: declined with `subject_erased` (free text,
 *         read by nothing — the decline is not "ran out of time"), audited, and the two follow-ons a shrinking roster
 *         owes are offered — the stage-1 all-green fan-out and the FitScore orchestrator. Nobody is told: its address
 *         is "[erased]" and the strip revoked its link.
 *
 *         MONEY IS NOT DECIDED HERE. A paid line is settled like any other, and the payment is raised to a person —
 *         §0's only automatic refund is a terminal run failure, and a subject withdrawing is not one. Whether erasure
 *         after payment is refunded is a product ruling not yet made; until it is, a person decides each case.
 *
 *         The update is guarded on BOTH halves — still undeclined, and actually erased — so a caller that misread a
 *         live party can decline nobody, and an overlapping run settles once.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { REDACTED } from "@/lib/popia/anonymisePlan"
import { recordAudit } from "@/lib/audit/recordAudit"
import { maybeFireAllGreen } from "@/lib/applications/peerCompletion"
import { maybeRunOrchestrator } from "@/lib/screening/maybeRunOrchestrator"

export interface ErasedCoLine {
  org_id: string
  application_id: string
  subject_id: string
  /** Whether the party's own line had been paid — raised to a person, never refunded here. */
  paid: boolean
}

/** Settle the line. True when this call declined it; false when it was already settled or the row is not erased. */
export async function settleErasedCoLine(service: SupabaseClient, line: ErasedCoLine): Promise<boolean> {
  const now = new Date().toISOString()
  const { data: settled, error } = await service
    .from("application_co_applicants")
    .update({ declined_at: now, decline_reason: "subject_erased" })
    .eq("id", line.subject_id)
    .eq("org_id", line.org_id)
    .is("declined_at", null)
    .eq("applicant_email", REDACTED)
    .select("id")
  if (error) throw new Error(`settle erased line: ${error.message}`)
  if (!settled?.length) return false

  await recordAudit(service, {
    orgId: line.org_id, table: "application_co_applicants", recordId: line.subject_id, action: "UPDATE",
    after: { declined_at: now, decline_reason: "subject_erased" },
  })
  if (line.paid) {
    Sentry.captureMessage("Paid screening line of an erased co party settled unrun — refund decision for a person", {
      level: "error", tags: { reason: "erased_paid_line" },
      extra: { application_id: line.application_id, subject_id: line.subject_id },
    })
  }
  await maybeFireAllGreen(service, line.application_id)
  await maybeRunOrchestrator(service, line.org_id, line.application_id)
  return true
}
