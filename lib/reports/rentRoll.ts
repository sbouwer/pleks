/**
 * lib/reports/rentRoll.ts — builds rent roll data for the reports module
 *
 * Data:  units, leases, arrears_cases, payments via service client
 * Notes: payment_method taken from last payment per lease; vacant units included as rows
 */
import { createServiceClient } from "@/lib/supabase/server"
import type { RentRollData, RentRollRow, ReportFilters } from "./types"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function buildRentRoll(filters: ReportFilters): Promise<RentRollData> {
  const supabase = await createServiceClient()
  const { orgId, propertyIds } = filters

  // Get all units with their lease/tenant info
  let unitQuery = supabase
    .from("units")
    .select("id, property_id, unit_number, status, properties(name)")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .eq("is_archived", false)

  if (propertyIds?.length) unitQuery = unitQuery.in("property_id", propertyIds)
  const { data: units } = await unitQuery

  const allUnits = units ?? []
  const unitIds = allUnits.map((u) => u.id)

  // Get active leases for these units
  const { data: leases, error: leasesError } = await supabase
    .from("leases")
    .select(`
      id, unit_id, start_date, end_date, is_fixed_term,
      rent_amount_cents, deposit_amount_cents, status,
      escalation_percent, escalation_review_date,
      tenant_view(first_name, last_name, email, phone)
    `)
    .eq("org_id", orgId)
    .in("unit_id", unitIds)
    .in("status", ["active"])
    logQueryError("buildRentRoll leases", leasesError)

  const leaseByUnit = new Map<string, typeof leases extends (infer T)[] | null ? T : never>()
  for (const l of leases ?? []) {
    leaseByUnit.set(l.unit_id, l)
  }

  // Get arrears for active cases
  const { data: arrearsCases, error: arrearsCasesError } = await supabase
    .from("arrears_cases")
    .select("unit_id, total_arrears_cents")
    .eq("org_id", orgId)
    .in("status", ["open", "arrangement"])
    logQueryError("buildRentRoll arrears_cases", arrearsCasesError)

  const arrearsByUnit = new Map<string, number>()
  for (const c of arrearsCases ?? []) {
    arrearsByUnit.set(c.unit_id, (arrearsByUnit.get(c.unit_id) ?? 0) + (c.total_arrears_cents ?? 0))
  }

  // Get last payment per unit
  const { data: lastPayments, error: lastPaymentsError } = await supabase
    .from("payments")
    .select("lease_id, payment_date, payment_method")
    .eq("org_id", orgId)
    .order("payment_date", { ascending: false })
    logQueryError("buildRentRoll payments", lastPaymentsError)

  const lastPaymentByLease = new Map<string, { date: string; method: string }>()
  for (const p of lastPayments ?? []) {
    if (p.lease_id && !lastPaymentByLease.has(p.lease_id)) {
      lastPaymentByLease.set(p.lease_id, { date: p.payment_date, method: p.payment_method ?? "" })
    }
  }

  const now = new Date()

  const rows: RentRollRow[] = allUnits.map((unit) => {
    const prop = unit.properties as unknown as { name: string } | null
    const lease = leaseByUnit.get(unit.id)
    const tenant = lease?.tenant_view as unknown as {
      first_name: string
      last_name: string
      email: string | null
      phone: string | null
    } | null
    const endDate = lease?.end_date ? new Date(lease.end_date) : null
    const daysToExpiry = endDate
      ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null

    const lastPay = lease ? lastPaymentByLease.get(lease.id) : null
    const paymentMethod = lastPay?.method ?? ""

    let leaseType = "vacant"
    if (lease) {
      leaseType = lease.is_fixed_term ? "fixed" : "month_to_month"
    }

    let status = unit.status
    if (!lease && unit.status === "occupied") status = "occupied"
    if (lease && !lease.is_fixed_term) status = "month_to_month"

    return {
      property_name: prop?.name ?? "",
      unit_number: unit.unit_number,
      tenant_name: tenant ? `${tenant.first_name} ${tenant.last_name}` : null,
      tenant_email: tenant?.email ?? null,
      tenant_phone: tenant?.phone ?? null,
      lease_start: lease?.start_date ? new Date(lease.start_date) : null,
      lease_end: endDate,
      lease_type: leaseType,
      monthly_rent_cents: lease?.rent_amount_cents ?? 0,
      deposit_held_cents: lease?.deposit_amount_cents ?? 0,
      payment_method: paymentMethod,
      status,
      days_to_expiry: daysToExpiry,
      last_payment_date: lastPay ? new Date(lastPay.date) : null,
      arrears_cents: arrearsByUnit.get(unit.id) ?? 0,
      escalation_percent: lease?.escalation_percent ?? null,
      escalation_review_date: lease?.escalation_review_date ? new Date(lease.escalation_review_date) : null,
    }
  }).sort((a, b) => a.property_name.localeCompare(b.property_name) || a.unit_number.localeCompare(b.unit_number))

  const occupiedRows = rows.filter((r) => r.tenant_name)

  return {
    as_at: now,
    rows,
    total_units: rows.length,
    occupied_units: occupiedRows.length,
    occupancy_rate: rows.length > 0 ? Math.round((occupiedRows.length / rows.length) * 100) : 0,
    total_monthly_rent_cents: occupiedRows.reduce((s, r) => s + r.monthly_rent_cents, 0),
    total_arrears_cents: rows.reduce((s, r) => s + r.arrears_cents, 0),
  }
}
