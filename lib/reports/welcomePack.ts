import { createServiceClient } from "@/lib/supabase/server"
import type {
  WelcomePackData,
  WelcomePackProperty,
  WelcomePackUnit,
  WelcomePackTotals,
  WelcomePackCpaNotice,
  WelcomePackEscalation,
} from "./types"

// CPA s14 notice must be sent at least 40 days before lease end
const CPA_NOTICE_WINDOW_DAYS = 40
// Show CPA warning when ≤ 80 days remain (40 days to act + 40 day notice)
const CPA_WARNING_THRESHOLD_DAYS = 80
const MS_PER_DAY = 86400000

function tenantDisplayName(
  firstName: string | null,
  lastName: string | null,
  companyName: string | null,
): string {
  return companyName ?? `${firstName ?? ""} ${lastName ?? ""}`.trim()
}

function computeFlags(
  status: string,
  daysRemaining: number | null,
  leaseExists: boolean,
): string[] {
  const flags: string[] = []
  if (!leaseExists) { flags.push("vacant"); return flags }
  if (status === "month_to_month") flags.push("month_to_month")
  if (status === "notice") flags.push("on_notice")
  if (daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 60) flags.push("expiring_soon")
  if (daysRemaining !== null && daysRemaining < 0) flags.push("expired")
  return flags
}

export async function buildWelcomePackData(
  orgId: string,
  landlordId: string,
): Promise<WelcomePackData> {
  const db = await createServiceClient()
  const now = new Date()

  // 1. Landlord name
  const { data: landlord, error: landlordError } = await db
    .from("landlord_view")
    .select("first_name, last_name, company_name")
    .eq("id", landlordId)
    .eq("org_id", orgId)
    .single()
  if (landlordError) console.error("welcomePack/landlord:", landlordError.message)

  const landlordName = landlord
    ? tenantDisplayName(landlord.first_name, landlord.last_name, landlord.company_name)
    : "Landlord"

  // 2. Properties
  const { data: propertiesRaw, error: propsError } = await db
    .from("properties")
    .select("id, name, type, address_line1, suburb, city, unit_count")
    .eq("landlord_id", landlordId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("name")
  if (propsError) console.error("welcomePack/properties:", propsError.message)

  const propsList = propertiesRaw ?? []
  const propertyIds = propsList.map((p) => p.id)

  const emptyTotals: WelcomePackTotals = {
    properties: 0, units: 0, occupied: 0, vacant: 0,
    monthly_income_cents: 0, deposits_held_cents: 0,
    annual_projected_income_cents: 0, vacancy_cost_cents: 0,
  }

  if (propertyIds.length === 0) {
    return { landlord_name: landlordName, generated_at: now, properties: [], totals: emptyTotals, compliance: { cpa_notices: [], escalations: [] } }
  }

  // 3. Units
  const { data: unitsRaw, error: unitsError } = await db
    .from("units")
    .select("id, property_id, unit_number, size_m2, status")
    .in("property_id", propertyIds)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("unit_number")
  if (unitsError) console.error("welcomePack/units:", unitsError.message)

  const unitsList = unitsRaw ?? []
  const unitIds = unitsList.map((u) => u.id)

  // 4. Active leases with tenant + co-tenants
  const { data: leasesRaw, error: leasesError } = await db
    .from("leases")
    .select(`
      id, unit_id, start_date, end_date, is_fixed_term,
      rent_amount_cents, deposit_amount_cents, status,
      debicheck_mandate_status, escalation_percent, escalation_review_date,
      cpa_applies, notice_period_days,
      tenant_view(first_name, last_name, company_name, entity_type),
      lease_co_tenants(tenant_id, tenants(id, contacts(first_name, last_name, company_name)))
    `)
    .eq("org_id", orgId)
    .in("unit_id", unitIds)
    .in("status", ["active", "notice", "month_to_month"])
    .is("deleted_at", null)
  if (leasesError) console.error("welcomePack/leases:", leasesError.message)

  type LeaseRow = NonNullable<typeof leasesRaw>[0]
  const leasesList = leasesRaw ?? []
  const leaseByUnit = new Map<string, LeaseRow>()
  for (const l of leasesList) leaseByUnit.set(l.unit_id, l)

  // Build per-property units
  const properties: WelcomePackProperty[] = propsList.map((prop) => {
    const propUnits = unitsList.filter((u) => u.property_id === prop.id)

    const units: WelcomePackUnit[] = propUnits.map((unit) => {
      const lease = leaseByUnit.get(unit.id)
      const tv = lease?.tenant_view as unknown as { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null

      const coTenantRows = (lease?.lease_co_tenants ?? []) as unknown as Array<{
        tenant_id: string
        tenants: { id: string; contacts: { first_name: string | null; last_name: string | null; company_name: string | null } | null } | null
      }>
      const coTenants = coTenantRows
        .map((ct) => {
          const c = ct.tenants?.contacts
          if (!c) return ""
          return tenantDisplayName(c.first_name, c.last_name, c.company_name)
        })
        .filter(Boolean)

      const endDate = lease?.end_date ? new Date(lease.end_date) : null
      const daysRemaining = endDate
        ? Math.ceil((endDate.getTime() - now.getTime()) / MS_PER_DAY)
        : null

      const rentCents = lease?.rent_amount_cents ?? 0
      const depositCents = lease?.deposit_amount_cents ?? 0
      const depositMonths = rentCents > 0 ? Math.round(depositCents / rentCents) : 0
      const escalationPct = lease?.escalation_percent ?? 0
      const nextRentCents = Math.round(rentCents * (1 + escalationPct / 100))
      const rentPerM2 = (unit.size_m2 && unit.size_m2 > 0 && rentCents > 0)
        ? Math.round(rentCents / unit.size_m2)
        : null

      const tenantName = tv
        ? tenantDisplayName(tv.first_name, tv.last_name, tv.company_name) || null
        : null

      const paymentMethod = lease?.debicheck_mandate_status === "active" ? "DebiCheck" : "EFT"
      const flags = computeFlags(lease?.status ?? "", daysRemaining, !!lease)

      return {
        unit_id: unit.id,
        unit_number: unit.unit_number,
        size_m2: unit.size_m2 ?? null,
        status: lease ? lease.status : "vacant",
        tenant_name: tenantName,
        tenant_type: tv?.entity_type ?? null,
        rent_cents: rentCents,
        deposit_cents: depositCents,
        deposit_months: depositMonths,
        rent_per_m2_cents: rentPerM2,
        lease_start: lease?.start_date ?? null,
        lease_end: lease?.end_date ?? null,
        days_remaining: daysRemaining,
        escalation_percent: escalationPct,
        escalation_date: lease?.escalation_review_date ?? null,
        next_rent_cents: nextRentCents,
        payment_method: lease ? paymentMethod : "",
        co_tenants: coTenants,
        flags,
      }
    })

    const occupiedUnits = units.filter((u) => !!u.tenant_name)
    const monthlyIncome = occupiedUnits.reduce((s, u) => s + u.rent_cents, 0)
    const address = [prop.address_line1, prop.suburb, prop.city].filter(Boolean).join(", ")

    return {
      id: prop.id,
      name: prop.name,
      type: (prop.type as string | null) ?? "residential",
      address,
      total_units: units.length,
      occupied_units: occupiedUnits.length,
      monthly_income_cents: monthlyIncome,
      units,
    }
  })

  // Totals
  const totalUnits = properties.reduce((s, p) => s + p.total_units, 0)
  const totalOccupied = properties.reduce((s, p) => s + p.occupied_units, 0)
  const totalIncome = properties.reduce((s, p) => s + p.monthly_income_cents, 0)
  const totalDeposits = leasesList.reduce((s, l) => s + (l.deposit_amount_cents ?? 0), 0)
  const avgRent = totalOccupied > 0 ? Math.round(totalIncome / totalOccupied) : 0
  const vacantCount = totalUnits - totalOccupied
  const vacancyCost = vacantCount * avgRent

  const totals: WelcomePackTotals = {
    properties: properties.length,
    units: totalUnits,
    occupied: totalOccupied,
    vacant: vacantCount,
    monthly_income_cents: totalIncome,
    deposits_held_cents: totalDeposits,
    annual_projected_income_cents: totalIncome * 12,
    vacancy_cost_cents: vacancyCost,
  }

  // Compliance: CPA notices + upcoming escalations
  const now12m = new Date(now.getTime() + 365 * MS_PER_DAY)
  const allUnitsFlat = properties.flatMap((p) => p.units)

  const cpaNotices: WelcomePackCpaNotice[] = allUnitsFlat
    .filter((u) => {
      const lease = leaseByUnit.get(u.unit_id)
      return (
        lease?.cpa_applies === true &&
        u.days_remaining !== null &&
        u.days_remaining > 0 &&
        u.days_remaining <= CPA_WARNING_THRESHOLD_DAYS
      )
    })
    .map((u) => {
      const prop = properties.find((p) => p.units.some((pu) => pu.unit_id === u.unit_id))
      const endDate = new Date(u.lease_end!)
      const noticeDueDate = new Date(endDate.getTime() - CPA_NOTICE_WINDOW_DAYS * MS_PER_DAY)
      return {
        tenant_name: u.tenant_name ?? "Unknown",
        unit: u.unit_number,
        property: prop?.name ?? "",
        lease_end: u.lease_end!,
        notice_due_by: noticeDueDate.toISOString().split("T")[0],
        days_remaining: u.days_remaining!,
      }
    })
    .sort((a, b) => a.days_remaining - b.days_remaining)

  const escalations: WelcomePackEscalation[] = allUnitsFlat
    .filter((u) => {
      if (!u.escalation_date || !u.tenant_name) return false
      const escDate = new Date(u.escalation_date)
      return escDate >= now && escDate <= now12m
    })
    .map((u) => {
      const prop = properties.find((p) => p.units.some((pu) => pu.unit_id === u.unit_id))
      return {
        tenant_name: u.tenant_name!,
        unit: u.unit_number,
        property: prop?.name ?? "",
        current_rent_cents: u.rent_cents,
        next_rent_cents: u.next_rent_cents,
        escalation_date: u.escalation_date!,
        escalation_percent: u.escalation_percent,
      }
    })
    .sort((a, b) => a.escalation_date.localeCompare(b.escalation_date))

  return {
    landlord_name: landlordName,
    generated_at: now,
    properties,
    totals,
    compliance: { cpa_notices: cpaNotices, escalations },
  }
}
