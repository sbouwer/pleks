import { computePreviousPeriod, toDateStr } from "./periods"
import { createServiceClient } from "@/lib/supabase/server"
import type { PeriodComparison, PortfolioFlag, PortfolioSummaryData, PropertySummary, ReportFilters } from "./types"

export async function buildPortfolioSummary(filters: ReportFilters): Promise<PortfolioSummaryData> {
  const supabase = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  // Build property filter
  let propFilter = supabase
    .from("properties")
    .select("id, name")
    .eq("org_id", orgId)
    .is("deleted_at", null)
  if (propertyIds?.length) propFilter = propFilter.in("id", propertyIds)
  const { data: properties } = await propFilter

  const propIds = properties?.map((p) => p.id) ?? []
  const propMap = new Map(properties?.map((p) => [p.id, p.name]) ?? [])

  if (propIds.length === 0) {
    return emptyPortfolio(from, to)
  }

  const fromStr = toDateStr(from)
  const toStr = toDateStr(to)

  // Parallel queries
  const [unitsRes, invoicesRes, paymentsRes, arrearsRes, maintenanceRes, leasesRes] =
    await Promise.all([
      supabase
        .from("units")
        .select("id, property_id, status, vacant_since")
        .eq("org_id", orgId)
        .in("property_id", propIds)
        .is("deleted_at", null)
        .eq("is_archived", false),
      supabase
        .from("rent_invoices")
        .select("unit_id, total_amount_cents, amount_paid_cents, status")
        .eq("org_id", orgId)
        .gte("period_from", fromStr)
        .lte("period_to", toStr),
      supabase
        .from("payments")
        .select("amount_cents, payment_method")
        .eq("org_id", orgId)
        .gte("payment_date", fromStr)
        .lte("payment_date", toStr),
      supabase
        .from("arrears_cases")
        .select("property_id, unit_id, total_arrears_cents, oldest_outstanding_date, current_step, tenant_name")
        .eq("org_id", orgId)
        .in("status", ["open", "arrangement"]),
      supabase
        .from("maintenance_requests")
        .select("id, property_id, status, urgency, actual_cost_cents, created_at, completed_at")
        .eq("org_id", orgId)
        .in("property_id", propIds),
      supabase
        .from("leases")
        .select("id, property_id, end_date, status")
        .eq("org_id", orgId)
        .eq("status", "active")
        .not("end_date", "is", null),
    ])

  const units = unitsRes.data ?? []
  const invoices = invoicesRes.data ?? []
  const payments = paymentsRes.data ?? []
  const arrearsCases = arrearsRes.data ?? []

  // Per-property arrears totals
  const propArrearsMap = new Map<string, number>()
  for (const c of arrearsCases) {
    const pid = c.property_id as string
    propArrearsMap.set(pid, (propArrearsMap.get(pid) ?? 0) + (c.total_arrears_cents ?? 0))
  }
  const maintenance = maintenanceRes.data ?? []
  const leases = leasesRes.data ?? []

  const totalUnits = units.length
  const occupiedUnits = units.filter((u) => u.status === "occupied").length
  const vacantUnits = units.filter((u) => u.status === "vacant").length
  const noticeUnits = units.filter((u) => u.status === "notice").length

  const expectedIncome = invoices.reduce((s, i) => s + (i.total_amount_cents ?? 0), 0)
  const collectedIncome = payments.reduce((s, p) => s + (p.amount_cents ?? 0), 0)

  // Arrears aging
  const now = Date.now()
  let arrears30 = 0, arrears60 = 0, arrears90plus = 0
  for (const c of arrearsCases) {
    const oldest = c.oldest_outstanding_date ? new Date(c.oldest_outstanding_date).getTime() : now
    const daysBehind = Math.floor((now - oldest) / (1000 * 60 * 60 * 24))
    if (daysBehind <= 30) arrears30 += c.total_arrears_cents ?? 0
    else if (daysBehind <= 60) arrears60 += c.total_arrears_cents ?? 0
    else arrears90plus += c.total_arrears_cents ?? 0
  }

  // Maintenance
  const openJobs = maintenance.filter((m) =>
    ["open", "quoted", "approved", "in_progress", "scheduled"].includes(m.status)
  ).length
  const overdueJobs = maintenance.filter((m) => {
    if (!["open", "in_progress", "scheduled"].includes(m.status)) return false
    const created = new Date(m.created_at).getTime()
    let slaHours: number
    if (m.urgency === "emergency") { slaHours = 4 }
    else if (m.urgency === "urgent") { slaHours = 24 }
    else { slaHours = 168 }
    return now - created > slaHours * 3600000
  }).length
  const maintSpend = maintenance
    .filter((m) => m.completed_at && m.completed_at >= fromStr && m.completed_at <= toStr)
    .reduce((s, m) => s + (m.actual_cost_cents ?? 0), 0)

  // Lease expiry
  const todayDate = new Date()
  const d30 = new Date(todayDate); d30.setDate(d30.getDate() + 30)
  const d60 = new Date(todayDate); d60.setDate(d60.getDate() + 60)
  const d90 = new Date(todayDate); d90.setDate(d90.getDate() + 90)

  const exp30 = leases.filter((l) => {
    const end = new Date(l.end_date as string)
    return end >= todayDate && end <= d30
  }).length
  const exp60 = leases.filter((l) => {
    const end = new Date(l.end_date as string)
    return end > d30 && end <= d60
  }).length
  const exp90 = leases.filter((l) => {
    const end = new Date(l.end_date as string)
    return end > d60 && end <= d90
  }).length

  const flags = buildFlags(arrearsCases, units, leases, propMap, now, todayDate, d30)

  // Optional period comparison — run previous-period income queries
  let comparison: PortfolioSummaryData["comparison"]
  if (filters.includePeriodComparison) {
    const prev = computePreviousPeriod(from, to)
    const prevFromStr = toDateStr(prev.from)
    const prevToStr = toDateStr(prev.to)
    const [prevInvoicesRes, prevPaymentsRes, prevMaintRes] = await Promise.all([
      supabase
        .from("rent_invoices")
        .select("total_amount_cents, amount_paid_cents")
        .eq("org_id", orgId)
        .gte("period_from", prevFromStr)
        .lte("period_to", prevToStr),
      supabase
        .from("payments")
        .select("amount_cents")
        .eq("org_id", orgId)
        .gte("payment_date", prevFromStr)
        .lte("payment_date", prevToStr),
      supabase
        .from("maintenance_requests")
        .select("actual_cost_cents, completed_at")
        .eq("org_id", orgId)
        .in("property_id", propIds)
        .gte("completed_at", prevFromStr)
        .lte("completed_at", prevToStr),
    ])
    const prevExpected = (prevInvoicesRes.data ?? []).reduce((s, i) => s + (i.total_amount_cents ?? 0), 0)
    const prevCollected = (prevPaymentsRes.data ?? []).reduce((s, p) => s + (p.amount_cents ?? 0), 0)
    const prevMaint = (prevMaintRes.data ?? []).reduce((s, m) => s + (m.actual_cost_cents ?? 0), 0)
    const prevCollectionRate = prevExpected > 0 ? Math.round((prevCollected / prevExpected) * 100) : 0
    const currentCollectionRate = expectedIncome > 0 ? Math.round((collectedIncome / expectedIncome) * 100) : 0

    comparison = {
      expected_income: makePeriodComparison(expectedIncome, prevExpected),
      collected_income: makePeriodComparison(collectedIncome, prevCollected),
      collection_rate: makePeriodComparison(currentCollectionRate, prevCollectionRate),
      maintenance_spend: makePeriodComparison(maintSpend, prevMaint),
    }
  }

  // Per-property breakdown
  const propertyBreakdown: PropertySummary[] = propIds.map((pid) => {
    const pUnits = units.filter((u) => u.property_id === pid)
    const pOccupied = pUnits.filter((u) => u.status === "occupied").length
    const pVacant = pUnits.filter((u) => u.status === "vacant").length
    const pNotice = pUnits.filter((u) => u.status === "notice").length
    const unitIds = new Set(pUnits.map((u) => u.id))
    const pInvoices = invoices.filter((i) => unitIds.has(i.unit_id))
    const pExpected = pInvoices.reduce((s, i) => s + (i.total_amount_cents ?? 0), 0)
    const pCollected = pInvoices.reduce((s, i) => s + (i.amount_paid_cents ?? 0), 0)
    const pMaint = maintenance
      .filter((m) => m.property_id === pid && m.completed_at && m.completed_at >= fromStr && m.completed_at <= toStr)
      .reduce((s, m) => s + (m.actual_cost_cents ?? 0), 0)

    return {
      property_id: pid,
      property_name: propMap.get(pid) ?? "Unknown",
      total_units: pUnits.length,
      occupied_units: pOccupied,
      vacant_units: pVacant,
      notice_units: pNotice,
      occupancy_rate: pUnits.length > 0 ? Math.round((pOccupied / pUnits.length) * 100) : 0,
      expected_income_cents: pExpected,
      collected_income_cents: pCollected,
      collection_rate: pExpected > 0 ? Math.round((pCollected / pExpected) * 100) : 0,
      arrears_cents: propArrearsMap.get(pid) ?? 0,
      maintenance_spend_cents: pMaint,
    }
  })

  return {
    period: { from, to },
    total_units: totalUnits,
    occupied_units: occupiedUnits,
    vacant_units: vacantUnits,
    notice_units: noticeUnits,
    occupancy_rate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
    expected_income_cents: expectedIncome,
    collected_income_cents: collectedIncome,
    collection_rate: expectedIncome > 0 ? Math.round((collectedIncome / expectedIncome) * 100) : 0,
    outstanding_cents: Math.max(0, expectedIncome - collectedIncome),
    tenants_in_arrears: arrearsCases.length,
    total_arrears_cents: arrearsCases.reduce((s, c) => s + (c.total_arrears_cents ?? 0), 0),
    arrears_30d_cents: arrears30,
    arrears_60d_cents: arrears60,
    arrears_90plus_cents: arrears90plus,
    open_jobs: openJobs,
    jobs_overdue_sla: overdueJobs,
    maintenance_spend_cents: maintSpend,
    expiring_30d: exp30,
    expiring_60d: exp60,
    expiring_90d: exp90,
    properties: propertyBreakdown,
    flags,
    comparison,
  }
}

function emptyPortfolio(from: Date, to: Date): PortfolioSummaryData {
  return {
    period: { from, to },
    total_units: 0, occupied_units: 0, vacant_units: 0, notice_units: 0, occupancy_rate: 0,
    expected_income_cents: 0, collected_income_cents: 0, collection_rate: 0, outstanding_cents: 0,
    tenants_in_arrears: 0, total_arrears_cents: 0, arrears_30d_cents: 0, arrears_60d_cents: 0, arrears_90plus_cents: 0,
    open_jobs: 0, jobs_overdue_sla: 0, maintenance_spend_cents: 0,
    expiring_30d: 0, expiring_60d: 0, expiring_90d: 0,
    properties: [],
    flags: [],
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePeriodComparison(current: number, previous: number): PeriodComparison {
  const delta_cents = current - previous
  let delta_percent: number
  if (previous === 0) {
    delta_percent = current > 0 ? 100 : 0
  } else {
    delta_percent = Math.round((delta_cents / previous) * 100)
  }
  let direction: PeriodComparison["direction"]
  if (delta_cents > 0) { direction = "up" }
  else if (delta_cents < 0) { direction = "down" }
  else { direction = "flat" }
  return { current, previous, delta_cents, delta_percent, direction }
}

type ArrearsCaseRow = {
  oldest_outstanding_date?: string | null
  tenant_name?: string | null
  total_arrears_cents?: number | null
  property_id?: string | null
  unit_id?: string | null
  current_step?: number | null
}

type UnitRow = {
  id: string
  property_id: string
  status: string
  vacant_since?: string | null
}

type LeaseRow = {
  id: string
  property_id: string
  end_date: string | null
  status: string
}

function buildFlags(
  arrearsCases: ArrearsCaseRow[],
  units: UnitRow[],
  leases: LeaseRow[],
  propMap: Map<string, string>,
  now: number,
  todayDate: Date,
  d30: Date,
): PortfolioFlag[] {
  const MS_30D = 30 * 24 * 3600000
  const flags: PortfolioFlag[] = []

  for (const c of arrearsCases) {
    const oldestMs = c.oldest_outstanding_date ? new Date(c.oldest_outstanding_date).getTime() : null
    if (oldestMs && (now - oldestMs) > MS_30D) {
      const sinceStr = new Date(c.oldest_outstanding_date as string).toLocaleDateString("en-ZA")
      flags.push({
        type: "arrears_90d",
        label: "Arrears > 30 days",
        detail: c.tenant_name
          ? `${c.tenant_name} — outstanding since ${sinceStr}`
          : `Outstanding arrears case since ${sinceStr}`,
      })
    }
  }

  for (const u of units) {
    if (u.status === "vacant" && u.vacant_since) {
      const vacantMs = new Date(u.vacant_since).getTime()
      if ((now - vacantMs) > MS_30D) {
        flags.push({
          type: "vacant_30d",
          label: "Vacant > 30 days",
          detail: `Unit at ${propMap.get(u.property_id) ?? "Unknown"} — vacant since ${new Date(u.vacant_since).toLocaleDateString("en-ZA")}`,
        })
      }
    }
  }

  for (const l of leases) {
    if (!l.end_date) continue
    const end = new Date(l.end_date)
    if (end >= todayDate && end <= d30) {
      flags.push({
        type: "lease_expiring_30d",
        label: "Lease expiring within 30 days",
        detail: `${propMap.get(l.property_id) ?? "Unknown"} — expires ${end.toLocaleDateString("en-ZA")}`,
      })
    }
  }

  return flags
}
