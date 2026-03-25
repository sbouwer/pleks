import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolvePeriod } from "@/lib/reports/periods"
import { buildIncomeCollectionReport } from "@/lib/reports/incomeCollection"
import { buildArrearsAgingReport } from "@/lib/reports/arrearsAging"
import { buildMaintenanceCostReport } from "@/lib/reports/maintenanceCosts"
import { buildRentRoll } from "@/lib/reports/rentRoll"
import { buildOccupancyReport } from "@/lib/reports/occupancy"
import { buildOwnerPortfolio } from "@/lib/reports/ownerPortfolio"
import {
  exportIncomeCollectionCSV,
  exportArrearsAgingCSV,
  exportMaintenanceCostsCSV,
  exportRentRollCSV,
  exportOccupancyCSV,
  exportOwnerPortfolioCSV,
  exportXeroIncome,
  exportXeroExpenses,
} from "@/lib/reports/exportCSV"
import {
  buildRentRollHTML,
  buildArrearsAgingHTML,
  buildIncomeCollectionHTML,
  buildPortfolioSummaryHTML,
} from "@/lib/reports/generatePDF"
import { buildPortfolioSummary } from "@/lib/reports/portfolioSummary"
import type { ReportPeriodType } from "@/lib/reports/types"
import { REPORT_TIER_ACCESS } from "@/lib/reports/types"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const params = req.nextUrl.searchParams
  const reportType = params.get("type") ?? ""
  const orgId = params.get("orgId") ?? ""
  const periodType = (params.get("periodType") ?? "this_month") as ReportPeriodType
  const format = params.get("format") ?? "csv"
  const xeroType = params.get("xeroType") // "income" | "expenses"

  if (!reportType || !orgId) {
    return Response.json({ error: "Missing params" }, { status: 400 })
  }

  // Auth check
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 })

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()

  const tier = sub?.tier ?? "owner"
  const allowed = REPORT_TIER_ACCESS[reportType as keyof typeof REPORT_TIER_ACCESS]
  if (!allowed?.includes(tier)) {
    return Response.json({ error: "Not available on your plan" }, { status: 403 })
  }

  const { from, to } = resolvePeriod(periodType)
  const propertyIdsStr = params.get("propertyIds")
  const propertyIds = propertyIdsStr ? propertyIdsStr.split(",").filter(Boolean) : undefined
  const filters = { orgId, from, to, propertyIds }

  // Get org info for PDF headers
  const { data: org } = await supabase
    .from("organisations")
    .select("name, logo_url, address_line1, phone, email")
    .eq("id", orgId)
    .single()

  const orgInfo = {
    name: org?.name ?? "Unknown",
    logo_url: org?.logo_url,
    address: org?.address_line1,
    phone: org?.phone,
    email: org?.email,
  }

  if (format === "csv") {
    let csv = ""
    const filename = `${reportType}_export.csv`

    switch (reportType) {
      case "income_collection":
        csv = exportIncomeCollectionCSV(await buildIncomeCollectionReport(filters))
        break
      case "arrears_aging":
        csv = exportArrearsAgingCSV(await buildArrearsAgingReport(filters))
        break
      case "maintenance_costs":
        csv = exportMaintenanceCostsCSV(await buildMaintenanceCostReport(filters))
        break
      case "rent_roll":
        csv = exportRentRollCSV(await buildRentRoll(filters))
        break
      case "occupancy":
        csv = exportOccupancyCSV(await buildOccupancyReport(filters))
        break
      case "owner_portfolio":
        csv = exportOwnerPortfolioCSV(await buildOwnerPortfolio(filters))
        break
      default:
        return Response.json({ error: "CSV export not available for this report" }, { status: 400 })
    }

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }

  if (format === "xero") {
    // Xero exports (Firm tier only)
    if (tier !== "firm") {
      return Response.json({ error: "Xero export is Firm tier only" }, { status: 403 })
    }

    let csv = ""
    let filename = ""

    if (xeroType === "income") {
      const data = await buildIncomeCollectionReport(filters)
      csv = exportXeroIncome(data)
      filename = `pleks_xero_income.csv`
    } else if (xeroType === "expenses") {
      const data = await buildMaintenanceCostReport(filters)
      csv = exportXeroExpenses(data)
      filename = `pleks_xero_expenses.csv`
    } else {
      return Response.json({ error: "xeroType must be 'income' or 'expenses'" }, { status: 400 })
    }

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }

  if (format === "pdf") {
    // Return HTML for now (client-side print or server-side Puppeteer later)
    let html = ""
    switch (reportType) {
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
        return Response.json({ error: "PDF export not available for this report" }, { status: 400 })
    }

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    })
  }

  return Response.json({ error: "Unknown format" }, { status: 400 })
}
