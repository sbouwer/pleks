/**
 * lib/screening/maybeRunOrchestrator.ts — runs the FitScore orchestrator once every live subject of an application is complete
 *
 * Auth:   none — server-only; callers are the line runner and the screening-portal-reminders cron (service client)
 * Data:   applications.searchworx_check_status (lead), application_co_applicants (live = declined_at IS NULL)
 * Notes:  ADDENDUM_14W §0: at the deadline whoever completed counts. Two events can make the set complete: a line
 *         finishing (the runner) and an unfinished line being declined at its deadline (the reminders cron). Before
 *         14W §0b only the first called this, so an application whose last open party was declined never ran.
 *         Gated on FITSCORE_V1_ENABLED. The lead is still required — the orchestrator asserts the lead's consent.
 *         ADDENDUM_14X N6: after a successful run the completed parties are told (notifyOutcome). This is "at D, after
 *         the run": the orchestrator runs only when no live party is outstanding — everyone completed, or the rest were
 *         declined at their D — so N6 never reaches a party while another's window is still open. Once per recipient
 *         comes from the trail, since a re-run returns ok exactly as a first run does.
 */
import * as Sentry from "@sentry/nextjs"
import type { createServiceClient } from "@/lib/supabase/server"
import { runFitScoreOrchestrator } from "@/lib/screening/fitScoreOrchestrator"
import { notifyOutcome } from "@/lib/screening/milestoneNotices"
import { optionalEnv } from "@/lib/env"

export async function maybeRunOrchestrator(
  service: Awaited<ReturnType<typeof createServiceClient>>, orgId: string, applicationId: string,
): Promise<void> {
  if (!optionalEnv("FITSCORE_V1_ENABLED")) return

  // Primary applicant must be complete
  const { data: app, error: appErr } = await service
    .from("applications")
    .select("searchworx_check_status")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (appErr) {
    console.error("[maybeRunOrchestrator] application read failed:", appErr.message)
    return
  }
  if (app?.searchworx_check_status !== "complete") return

  // All LIVE co-applicants must be complete. A declined party has left the set (the view drops it too), so it never
  // completes — counting it held FitScore back for good once residential lines reached this runner (walker F8).
  const { data: coApps, error: coErr } = await service
    .from("application_co_applicants")
    .select("searchworx_check_status")
    .eq("primary_application_id", applicationId)
    .eq("org_id", orgId)
    .is("declined_at", null)
  if (coErr) {
    console.error("[maybeRunOrchestrator] co-applicant read failed:", coErr.message)
    return
  }
  if ((coApps ?? []).some((c) => c.searchworx_check_status !== "complete")) return

  console.log(`[maybeRunOrchestrator] all live subjects complete for ${applicationId} — running FitScore orchestrator`)
  // Never throws: a caller (the deadline decline) has already committed its own write and must not lose what follows
  // to the orchestrator — assertScreeningConsent throws on a breach (walker 14w-s0b F6).
  let orchResult: Awaited<ReturnType<typeof runFitScoreOrchestrator>>
  try {
    orchResult = await runFitScoreOrchestrator(applicationId, service)
  } catch (err) {
    Sentry.captureException(err, { extra: { application_id: applicationId } })
    return
  }
  if (!orchResult.ok) {
    console.error(`[maybeRunOrchestrator] FitScore orchestrator failed for ${applicationId}:`, orchResult.reason)
    Sentry.captureMessage("FitScore orchestrator failed", {
      level: "error",
      extra: { application_id: applicationId, reason: orchResult.reason },
    })
    return
  }
  await notifyOutcome(service, { orgId, applicationId }).catch((err: unknown) =>
    Sentry.captureException(err, { tags: { milestone: "N6" }, extra: { application_id: applicationId } }))
}
