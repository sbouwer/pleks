import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolvePeriod } from "@/lib/reports/periods"
import { buildPortfolioSummary } from "@/lib/reports/portfolioSummary"
import { buildOccupancyReport } from "@/lib/reports/occupancy"
import { buildIncomeCollectionReport } from "@/lib/reports/incomeCollection"
import { buildArrearsAgingReport } from "@/lib/reports/arrearsAging"
import { buildMaintenanceCostReport } from "@/lib/reports/maintenanceCosts"
import { buildLeaseExpiryReport } from "@/lib/reports/leaseExpiry"
import { buildRentRoll } from "@/lib/reports/rentRoll"
import { buildApplicationPipeline } from "@/lib/reports/applicationPipeline"
import { buildOwnerPortfolio } from "@/lib/reports/ownerPortfolio"
import type { ReportPeriodType, ReportType } from "@/lib/reports/types"
import { REPORT_TIER_ACCESS } from "@/lib/reports/types"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const params = req.nextUrl.searchParams
  const reportType = params.get("type") as ReportType
  const orgId = params.get("orgId")
  const periodType = (params.get("periodType") ?? "this_month") as ReportPeriodType
  const propertyIdsStr = params.get("propertyIds")
  const customFrom = params.get("customFrom")
  const customTo = params.get("customTo")

  if (!reportType || !orgId) {
    return Response.json({ error: "Missing type or orgId" }, { status: 400 })
  }

  // Verify user belongs to org
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 })

  // Check tier access
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()

  const tier = sub?.tier ?? "owner"
  const allowed = REPORT_TIER_ACCESS[reportType]
  if (!allowed?.includes(tier)) {
    return Response.json({ error: "Report not available on your plan" }, { status: 403 })
  }

  const { from, to } = resolvePeriod(
    periodType,
    customFrom ? new Date(customFrom) : undefined,
    customTo ? new Date(customTo) : undefined
  )

  const propertyIds = propertyIdsStr ? propertyIdsStr.split(",").filter(Boolean) : undefined
  const filters = { orgId, from, to, propertyIds }

  const builders: Record<string, (f: typeof filters) => Promise<unknown>> = {
    portfolio_summary: buildPortfolioSummary,
    occupancy: buildOccupancyReport,
    income_collection: buildIncomeCollectionReport,
    arrears_aging: buildArrearsAgingReport,
    maintenance_costs: buildMaintenanceCostReport,
    lease_expiry: buildLeaseExpiryReport,
    rent_roll: buildRentRoll,
    application_pipeline: buildApplicationPipeline,
    owner_portfolio: buildOwnerPortfolio,
  }

  const builder = builders[reportType]
  if (!builder) {
    return Response.json({ error: "Unknown report type" }, { status: 400 })
  }

  const data = await builder(filters)
  return Response.json(data)
}
