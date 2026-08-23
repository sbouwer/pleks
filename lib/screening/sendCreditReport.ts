"use server"

/**
 * lib/screening/sendCreditReport.ts — email the completed credit/FitScore report to an applicant, once per application
 *
 * Data:   reads communication_log (dedup on template_key + entity_id) and the application email context; dispatches via sendCreditReportDelivered; service client.
 * Notes:  "use server" module; no-ops if a report was already sent for the application.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCreditReportDelivered } from "@/lib/applications/emails"

export async function sendCreditReportToApplicant(applicationId: string): Promise<void> {
  const supabase = await createServiceClient()

  // Dedup: only send once per application. A false zero here is a SECOND credit report emailed to
  // an applicant — `count: null` from a failed read used to satisfy `(count ?? 0) > 0 === false`,
  // which is the branch that means "never sent, go ahead". Refuse to decide instead: the caller's
  // retry sends once when the log is readable, where guessing sends twice today.
  const { count, error: dedupError } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("template_key", "application.credit_report_delivered")
    .eq("entity_id", applicationId)
  if (dedupError || count === null) {
    throw new Error(
      `sendCreditReportToApplicant(${applicationId}): could not read the delivery log ` +
        `(${dedupError?.message ?? "count was null"}). Not sending — an unreadable dedup state must not read as "not yet sent".`,
    )
  }

  if (count > 0) return

  const ctx = await buildEmailContext(applicationId)
  if (!ctx) return

  const fitScore = ctx.appSummary.prescreenScore ?? 0
  const rawComponents = ctx.appSummary as unknown as { fitscore_components?: Record<string, { score: number }> }
  const components: Record<string, number> = {}
  if (rawComponents.fitscore_components) {
    for (const [k, v] of Object.entries(rawComponents.fitscore_components)) {
      components[k] = typeof v === "object" ? v.score : (v as number)
    }
  }

  void sendCreditReportDelivered(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {
    fitScore,
    components: Object.keys(components).length > 0 ? components : undefined,
  })
}
