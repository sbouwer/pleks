import { createServiceClient } from "@/lib/supabase/server"
import type { ApplicationPipelineData, ReportFilters } from "./types"

export async function buildApplicationPipeline(filters: ReportFilters): Promise<ApplicationPipelineData> {
  const supabase = await createServiceClient()
  const { orgId, from, to } = filters

  const fromStr = from.toISOString()
  const toStr = to.toISOString()

  // Get listings
  const { data: listings } = await supabase
    .from("listings")
    .select(`
      id, views_count, applications_count,
      units(unit_number),
      properties(name)
    `)
    .eq("org_id", orgId)

  // Get applications in period
  const { data: applications } = await supabase
    .from("applications")
    .select(`
      id, listing_id, stage1_status, stage2_status, fee_status,
      fee_amount_cents, fitscore, tenant_id, created_at
    `)
    .eq("org_id", orgId)
    .gte("created_at", fromStr)
    .lte("created_at", toStr)

  const apps = applications ?? []
  const listingData = listings ?? []

  const totalViews = listingData.reduce((s, l) => s + (l.views_count ?? 0), 0)
  const started = apps.length
  const submitted = apps.filter((a) => a.stage1_status !== "draft").length
  const feePaid = apps.filter((a) => a.fee_status === "paid").length
  const screeningComplete = apps.filter((a) => a.stage2_status === "screening_complete" || a.stage2_status === "approved" || a.stage2_status === "declined").length
  const approved = apps.filter((a) => a.stage2_status === "approved").length
  const leaseSigned = apps.filter((a) => a.tenant_id).length

  const feeRevenue = apps
    .filter((a) => a.fee_status === "paid")
    .reduce((s, a) => s + (a.fee_amount_cents ?? 0), 0)

  // FitScore distribution
  const scored = apps.filter((a) => a.fitscore != null)
  const dist = [
    { range: "80-100", count: scored.filter((a) => a.fitscore! >= 80).length },
    { range: "60-79", count: scored.filter((a) => a.fitscore! >= 60 && a.fitscore! < 80).length },
    { range: "40-59", count: scored.filter((a) => a.fitscore! >= 40 && a.fitscore! < 60).length },
    { range: "<40", count: scored.filter((a) => a.fitscore! < 40).length },
  ]

  // Average days from application to lease (for those with tenant_id)
  const withLease = apps.filter((a) => a.tenant_id)
  const avgDays = withLease.length > 0
    ? Math.round(withLease.reduce((s, a) => {
        const created = new Date(a.created_at).getTime()
        const now = Date.now()
        return s + (now - created) / (1000 * 60 * 60 * 24)
      }, 0) / withLease.length)
    : 0

  // Per listing breakdown
  const listingBreakdown = listingData.map((l) => {
    const unit = l.units as unknown as { unit_number: string } | null
    const prop = l.properties as unknown as { name: string } | null
    const listingApps = apps.filter((a) => a.listing_id === l.id)
    return {
      listing_id: l.id,
      property_name: prop?.name ?? "",
      unit_number: unit?.unit_number ?? "",
      views: l.views_count ?? 0,
      applications: listingApps.length,
      approved: listingApps.filter((a) => a.stage2_status === "approved").length,
    }
  })

  return {
    period: { from, to },
    listing_views: totalViews,
    applications_started: started,
    applications_submitted: submitted,
    fee_paid: feePaid,
    screening_complete: screeningComplete,
    approved,
    lease_signed: leaseSigned,
    fitscore_distribution: dist,
    average_days_to_lease: avgDays,
    revenue_from_fees_cents: feeRevenue,
    listings: listingBreakdown,
  }
}
