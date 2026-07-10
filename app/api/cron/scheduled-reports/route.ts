/**
 * app/api/cron/scheduled-reports/route.ts — daily: build + deliver Firm-tier scheduled reports
 *
 * Route:  GET /api/cron/scheduled-reports — runs inside the daily orchestrator (09:00 check)
 * Auth:   x-cron-secret header
 * Data:   report_configs (due today, Firm tier) → report builders → "reports" Storage bucket → sendEmail
 * Notes:  Builds the report HTML, stores it, and emails each recipient_emails address a signed 30-day download
 *         link (O-1: this used to stop at "store + stamp last_sent_at" and deliver nothing). PDF conversion is
 *         still deferred. last_sent_at is stamped once the report is built + stored; per-email outcomes are
 *         surfaced via the belt ({ emails_sent, emails_failed }) → the daily cron digest.
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getReportBranding } from "@/lib/reports/reportBranding"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { sendScheduledReportEmail } from "@/lib/reports/scheduledReportEmail"
import { trackSend, settleSends } from "@/lib/cron/settleSends"
import { resolvePeriod } from "@/lib/reports/periods"
import { buildPortfolioSummary } from "@/lib/reports/portfolioSummary"
import { buildRentRoll } from "@/lib/reports/rentRoll"
import { buildArrearsAgingReport } from "@/lib/reports/arrearsAging"
import { buildIncomeCollectionReport } from "@/lib/reports/incomeCollection"
import {
  buildPortfolioSummaryHTML,
  buildRentRollHTML,
  buildArrearsAgingHTML,
  buildIncomeCollectionHTML,
} from "@/lib/reports/generatePDF"
import type { ReportFilters } from "@/lib/reports/types"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"

// Runs daily at 09:00 — checks for reports due today
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createServiceClient()
  const today = new Date()
  const dayOfMonth = today.getDate()

  // Find scheduled reports due today, Firm tier only
  const { data: configs, error: configsError } = await supabase
    .from("report_configs")
    .select("*")
    .eq("is_scheduled", true)
    .eq("schedule_day", dayOfMonth)
    logQueryError("GET report_configs", configsError)

  let reportsBuilt = 0
  const sends: Promise<unknown>[] = []   // C-1 belt: collect + await + surface email failures before return

  for (const config of configs ?? []) {
    // Verify Firm tier
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("tier")
      .eq("org_id", config.org_id)
      .eq("status", "active")
      .single()
    logQueryError("GET subscriptions", subError)

    if (sub?.tier !== "firm") continue

    const { from, to } = resolvePeriod(config.period_type ?? "last_month")
    const filters: ReportFilters = {
      orgId: config.org_id,
      from,
      to,
      propertyIds: config.property_ids?.length ? config.property_ids : undefined,
    }

    const orgInfo = await getReportBranding(config.org_id)

    // Build report HTML
    let html = ""
    switch (config.report_type) {
      case "portfolio_summary":
        html = buildPortfolioSummaryHTML(await buildPortfolioSummary(filters), orgInfo)
        break
      case "rent_roll":
        html = buildRentRollHTML(await buildRentRoll(filters), orgInfo)
        break
      case "arrears_aging":
        html = buildArrearsAgingHTML(await buildArrearsAgingReport(filters), orgInfo)
        break
      case "income_collection":
        html = buildIncomeCollectionHTML(await buildIncomeCollectionReport(filters), orgInfo)
        break
      default:
        continue
    }

    // Store HTML report (PDF conversion can be done via Edge Function later)
    const filename = `reports/${config.org_id}/${config.report_type}-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}.html`
    const { error: uploadErr } = await supabase.storage.from("reports").upload(filename, html, {
      contentType: "text/html",
      upsert: true,
    })
    if (uploadErr) { console.error("scheduled-reports: upload failed for", config.id, uploadErr.message); continue }

    // Deliver: a signed 30-day download link emailed to each configured recipient (O-1 — was a no-op stub).
    const { data: signed, error: signErr } = await supabase.storage.from("reports").createSignedUrl(filename, 60 * 60 * 24 * 30)
    if (signErr) console.error("scheduled-reports: signed URL failed for", config.id, signErr.message)
    const downloadUrl = signed?.signedUrl
    const branding = buildBranding(await fetchOrgSettings(config.org_id))
    const periodLabel = `${from} – ${to}`

    for (const email of (config.recipient_emails ?? []) as string[]) {
      if (!email || !downloadUrl) continue
      trackSend(sends, `scheduled-reports ${config.org_id}`, sendScheduledReportEmail({
        orgId:         config.org_id,
        configId:      config.id,
        email,
        recipientName: orgInfo.org_name ?? "Recipient",
        reportType:    config.report_type,
        periodLabel,
        downloadUrl,
        branding,
      }))
    }

    await supabase
      .from("report_configs")
      .update({ last_sent_at: today.toISOString() })
      .eq("id", config.id)

    reportsBuilt++
  }

  const { sent, failed } = await settleSends(sends)
  return Response.json({ ok: true, reports_built: reportsBuilt, emails_sent: sent, emails_failed: failed })
}
