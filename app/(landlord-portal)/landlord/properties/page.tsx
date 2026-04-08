import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import Link from "next/link"
import { ChevronRight, Building2 } from "lucide-react"
import { formatZAR } from "@/lib/constants"

export default async function LandlordPropertiesPage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  const { data: properties } = await service
    .from("properties")
    .select("id, name, address_line1, suburb, city, unit_count, property_type")
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    .order("name")

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

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-heading text-3xl mb-6">Your properties</h1>

      {(properties ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">No properties linked to your account yet.</p>
      )}

      {(properties ?? []).map((p) => {
        const address = [p.address_line1, p.suburb, p.city].filter(Boolean).join(", ")
        const units = p.unit_count ?? 0
        const occupied = leasesByProperty[p.id] ?? 0
        const occupancyPct = units > 0 ? Math.round((occupied / units) * 100) : 0
        const monthlyRent = rentByProperty[p.id] ?? 0
        const activeMaintCount = maintByProperty[p.id] ?? 0

        return (
          <Link key={p.id} href={`/landlord/properties/${p.id}`} className="block">
            <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 hover:border-brand/40 transition-colors group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    {address && <p className="text-xs text-muted-foreground mt-0.5">{address}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span>Occupancy: {occupancyPct}% ({occupied}/{units})</span>
                      {monthlyRent > 0 && <span>Monthly rent: {formatZAR(monthlyRent)}</span>}
                      {activeMaintCount > 0 && (
                        <span className="text-warning">{activeMaintCount} maintenance job{activeMaintCount !== 1 ? "s" : ""} active</span>
                      )}
                      {activeMaintCount === 0 && <span className="text-success">No active issues</span>}
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-1" />
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
