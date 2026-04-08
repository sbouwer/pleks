"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCreditReportDelivered } from "@/lib/applications/emails"

export async function sendCreditReportToApplicant(applicationId: string): Promise<void> {
  const supabase = await createServiceClient()

  // Dedup: only send once per application
  const { count } = await supabase
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("template_key", "application.credit_report_delivered")
    .eq("entity_id", applicationId)

  if ((count ?? 0) > 0) return

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
