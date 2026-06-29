/**
 * app/(landlord)/landlord/properties/page.tsx — Landlord portal: the landlord's properties list
 *
 * Route:  /landlord/properties
 * Auth:   getLandlordSession (token-gated landlord portal); scoped to landlord_id
 * Data:   createServiceClient — properties (+ unit count), leases, maintenance_requests
 * Notes:  Canon ResourcePageHeader + ListCard rows / EmptyResourceState (door style) — presentation only.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import Link from "next/link"
import { ChevronRight, Building2 } from "lucide-react"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ListCard } from "@/components/ui/resource-list"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function LandlordPropertiesPage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  const { data: properties, error: propertiesError } = await service
    .from("properties")
    .select("id, name, address_line1, suburb, city, units(count), property_type:type")
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    .order("name")
    logQueryError("LandlordPropertiesPage properties", propertiesError)

  const propertyIds = (properties ?? []).map((p) => p.id)

  const { data: leases } = propertyIds.length > 0
    ? await service
        .from("leases")
        .select("property_id, rent_amount_cents")
        .in("property_id", propertyIds)
        .in("status", ["active", "notice", "month_to_month", "signed"])
        .is("deleted_at", null)
    : { data: [] }

  const { data: activeMaint } = propertyIds.length > 0
    ? await service
        .from("maintenance_requests")
        .select("property_id")
        .in("property_id", propertyIds)
        .not("status", "in", "(completed,closed,cancelled,rejected)")
    : { data: [] }

  const rentByProperty: Record<string, number> = {}
  const leasesByProperty: Record<string, number> = {}
  for (const l of leases ?? []) {
    rentByProperty[l.property_id] = (rentByProperty[l.property_id] ?? 0) + (l.rent_amount_cents ?? 0)
    leasesByProperty[l.property_id] = (leasesByProperty[l.property_id] ?? 0) + 1
  }

  const maintByProperty: Record<string, number> = {}
  for (const m of activeMaint ?? []) {
    maintByProperty[m.property_id] = (maintByProperty[m.property_id] ?? 0) + 1
  }

  const list = properties ?? []

  if (list.length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Landlord"
        title="Your properties"
        headline="No properties yet"
        headerSub="Properties your agent links to your account will appear here."
        emptyTitle="No properties linked yet"
        emptySub="Once your managing agent links a property to your account, it will appear here."
        icon={<Building2 className="h-6 w-6" />}
      />
    )
  }

  return (
    <div>
      <ResourcePageHeader
        eyebrow="Landlord"
        title="Your properties"
        headline={`${list.length} propert${list.length === 1 ? "y" : "ies"}`}
      />
      <ListCard>
        <div className="divide-y divide-border">
          {list.map((p) => {
            const address = [p.address_line1, p.suburb, p.city].filter(Boolean).join(", ")
            const units = (p.units as unknown as { count: number }[] | null)?.[0]?.count ?? 0
            const occupied = leasesByProperty[p.id] ?? 0
            const occupancyPct = units > 0 ? Math.round((occupied / units) * 100) : 0
            const monthlyRent = rentByProperty[p.id] ?? 0
            const activeMaintCount = maintByProperty[p.id] ?? 0

            return (
              <Link key={p.id} href={`/landlord/properties/${p.id}`} className="group flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-button)] bg-muted text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{p.name}</p>
                    {address && <p className="mt-0.5 text-xs text-muted-foreground">{address}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Occupancy: {occupancyPct}% ({occupied}/{units})</span>
                      {monthlyRent > 0 && <span>Monthly rent: {formatZAR(monthlyRent)}</span>}
                      {activeMaintCount > 0 && (
                        <span className="text-warning">{activeMaintCount} maintenance job{activeMaintCount !== 1 ? "s" : ""} active</span>
                      )}
                      {activeMaintCount === 0 && <span className="text-success">No active issues</span>}
                    </div>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      </ListCard>
    </div>
  )
}
