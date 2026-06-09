/**
 * lib/dashboard/portfolioHealth.ts — agent-facing operational metrics for the dashboard Portfolio-health panel
 *
 * Auth:   service client (getCachedServiceClient); org-scoped by org_id.
 * Data:   leases (term + vacancy gaps + signed_at), maintenance_requests (hotspot by property),
 *         applications + listings (lead→lease cycle time). Aggregated in JS over one org's rows.
 * Notes:  Date arithmetic via new Date() lives here (not a component) so render stays pure. Each metric is
 *         null when there's not enough data to compute it (the panel shows "—"). Each metric is its own
 *         helper to keep the resolver under the cognitive-complexity gate.
 */
import { getCachedServiceClient } from "@/lib/supabase/server"

export interface PortfolioHealth {
  avgLeaseTermMonths: number | null
  avgVacancyDays: number | null
  maintenanceHotspot: { propertyId: string; name: string; count: number } | null
  leadToLeaseDays: number | null
}

const DAY = 86_400_000

interface LeaseRow {
  unit_id: string | null
  tenant_id: string | null
  start_date: string | null
  end_date: string | null
  signed_at: string | null
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
}

/** Average lease term (months) over leases with both dates. */
function avgLeaseTermMonths(leases: LeaseRow[]): number | null {
  const terms: number[] = []
  for (const l of leases) {
    if (!l.start_date || !l.end_date) continue
    const d = (new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / DAY
    if (d > 0) terms.push(d)
  }
  const avg = mean(terms)
  return avg == null ? null : Math.round(avg / 30.44)
}

/** Average days a unit sits empty between consecutive leases. */
function avgVacancyDays(leases: LeaseRow[]): number | null {
  const byUnit = new Map<string, { start: number; end: number }[]>()
  for (const l of leases) {
    if (!l.unit_id || !l.start_date || !l.end_date) continue
    const arr = byUnit.get(l.unit_id) ?? []
    arr.push({ start: new Date(l.start_date).getTime(), end: new Date(l.end_date).getTime() })
    byUnit.set(l.unit_id, arr)
  }
  const gaps: number[] = []
  for (const arr of byUnit.values()) {
    arr.sort((a, b) => a.start - b.start)
    for (let i = 1; i < arr.length; i++) {
      const gap = (arr[i].start - arr[i - 1].end) / DAY
      if (gap > 0) gaps.push(gap)
    }
  }
  const avg = mean(gaps)
  return avg == null ? null : Math.round(avg)
}

/** The property with the most maintenance requests (the time sink). */
function topMaintenance(rows: { property_id: string | null; properties: { name: string } | null }[]): PortfolioHealth["maintenanceHotspot"] {
  const counts = new Map<string, { name: string; count: number }>()
  for (const m of rows) {
    if (!m.property_id) continue
    const cur = counts.get(m.property_id) ?? { name: m.properties?.name ?? "—", count: 0 }
    cur.count += 1
    counts.set(m.property_id, cur)
  }
  let top: PortfolioHealth["maintenanceHotspot"] = null
  for (const [propertyId, v] of counts) {
    if (!top || v.count > top.count) top = { propertyId, name: v.name, count: v.count }
  }
  return top
}

/** Average days from advert (listing created) to lease signed, via the tenant's earliest Pleks application. */
function avgLeadToLeaseDays(
  leases: LeaseRow[],
  apps: { tenant_id: string | null; listing_id: string | null; created_at: string }[],
  listings: { id: string; created_at: string }[],
): number | null {
  const listingCreated = new Map<string, number>()
  for (const ls of listings) listingCreated.set(ls.id, new Date(ls.created_at).getTime())

  const tenantAdvert = new Map<string, number>()
  for (const a of apps) {
    if (!a.tenant_id || !a.listing_id) continue
    const lc = listingCreated.get(a.listing_id)
    if (lc == null) continue
    const prev = tenantAdvert.get(a.tenant_id)
    if (prev == null || lc < prev) tenantAdvert.set(a.tenant_id, lc)
  }

  const cycle: number[] = []
  for (const l of leases) {
    if (!l.signed_at || !l.tenant_id) continue
    const advert = tenantAdvert.get(l.tenant_id)
    if (advert == null) continue
    const days = (new Date(l.signed_at).getTime() - advert) / DAY
    if (days > 0) cycle.push(days)
  }
  const avg = mean(cycle)
  return avg == null ? null : Math.round(avg)
}

export async function getPortfolioHealth(orgId: string): Promise<PortfolioHealth> {
  const db = await getCachedServiceClient()
  const [leasesRes, maintRes, appsRes, listingsRes] = await Promise.all([
    db.from("leases").select("unit_id, tenant_id, start_date, end_date, signed_at").eq("org_id", orgId).is("deleted_at", null),
    db.from("maintenance_requests").select("property_id, properties(name)").eq("org_id", orgId),
    db.from("applications").select("tenant_id, listing_id, created_at").eq("org_id", orgId),
    db.from("listings").select("id, created_at").eq("org_id", orgId),
  ])
  if (leasesRes.error) console.error("portfolioHealth leases:", leasesRes.error.message)
  if (maintRes.error) console.error("portfolioHealth maintenance:", maintRes.error.message)
  if (appsRes.error) console.error("portfolioHealth applications:", appsRes.error.message)
  if (listingsRes.error) console.error("portfolioHealth listings:", listingsRes.error.message)

  const leases = (leasesRes.data ?? []) as LeaseRow[]
  const maint = (maintRes.data ?? []) as unknown as { property_id: string | null; properties: { name: string } | null }[]
  const apps = (appsRes.data ?? []) as { tenant_id: string | null; listing_id: string | null; created_at: string }[]
  const listings = (listingsRes.data ?? []) as { id: string; created_at: string }[]

  return {
    avgLeaseTermMonths: avgLeaseTermMonths(leases),
    avgVacancyDays: avgVacancyDays(leases),
    maintenanceHotspot: topMaintenance(maint),
    leadToLeaseDays: avgLeadToLeaseDays(leases, apps, listings),
  }
}
