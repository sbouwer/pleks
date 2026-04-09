import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getOrgDisplayName } from "@/lib/org/displayName"
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

// Runs daily at 09:00 — checks for reports due today
export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date()
  const dayOfMonth = today.getDate()

  // Find scheduled reports due today, Firm tier only
  const { data: configs } = await supabase
    .from("report_configs")
    .select("*, organisations(name, type, trading_as, first_name, last_name, title, initials, logo_url, address_line1, phone, email, id)")
    .eq("is_scheduled", true)
    .eq("schedule_day", dayOfMonth)

  let sent = 0

  for (const config of configs ?? []) {
    const org = config.organisations as Record<string, unknown> | null
    if (!org) continue

    // Verify Firm tier
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier")
      .eq("org_id", config.org_id)
      .eq("status", "active")
      .single()

    if (sub?.tier !== "firm") continue

    const { from, to } = resolvePeriod(config.period_type ?? "last_month")
    const filters: ReportFilters = {
      orgId: config.org_id,
      from,
      to,
      propertyIds: config.property_ids?.length ? config.property_ids : undefined,
    }

    const orgInfo = {
      name: getOrgDisplayName(org as unknown as Parameters<typeof getOrgDisplayName>[0]),
      logo_url: org.logo_url as string | null,
      address: org.address_line1 as string | null,
      phone: org.phone as string | null,
      email: org.email as string | null,
    }

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
    await supabase.storage.from("reports").upload(filename, html, {
      contentType: "text/html",
      upsert: true,
    })

    // TODO: Send emails to config.recipient_emails with attached report
    // For now, just update last_sent_at
    await supabase
      .from("report_configs")
      .update({ last_sent_at: today.toISOString() })
      .eq("id", config.id)

    sent++
  }

  return Response.json({ ok: true, reports_sent: sent })
}
