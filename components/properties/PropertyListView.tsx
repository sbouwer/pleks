import Link from "next/link"
import { Plus, MapPin, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Suspense } from "react"
import { PortfolioMetrics } from "./PropertyMetrics"
import { PropertyFilters } from "./PropertyFilters"
import { PropertyList } from "./PropertyList"
import type { PropertyListItem } from "./PropertyList"
import type { Tier } from "@/lib/constants"

interface Props {
  properties: PropertyListItem[]
  view: "list" | "cards"
  tier: Tier
  totalUnitCount: number
}

export function PropertyListView({ properties, view, tier, totalUnitCount }: Readonly<Props>) {
  const totalUnits = properties.reduce((sum, p) =>
    sum + p.units.filter(u => !u.is_archived).length, 0)
  const occupiedUnits = properties.reduce((sum, p) =>
    sum + p.units.filter(u => !u.is_archived && u.status === "occupied").length, 0)
  const rentRollCents = properties.reduce((sum, p) =>
    sum + p.units.filter(u => !u.is_archived).reduce((us, u) => {
      const activeLease = u.leases.find(l => l.status === "active")
      return us + (activeLease?.rent_amount_cents ?? 0)
    }, 0), 0)
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-3xl">Properties</h1>
          {properties.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1 hidden lg:block">
              {properties.length} {properties.length === 1 ? "property" : "properties"} &middot;{" "}
              {totalUnits} active {totalUnits === 1 ? "unit" : "units"} &middot;{" "}
              {occupancyPct}% occupied &middot;{" "}
              {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(rentRollCents / 100)}/mo rent roll
            </p>
          )}
          {properties.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 lg:hidden">
              {properties.length} {properties.length === 1 ? "property" : "properties"} · {occupancyPct}% occupied
            </p>
          )}
        </div>
        <Button size="sm" render={<Link href="/properties/new" />}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </div>

      {/* Mobile property cards */}
      <div className="lg:hidden">
        {properties.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-8 w-8 text-muted-foreground" />}
            title="No properties yet"
            description="Add your first property to get started."
          />
        ) : (
          <div className="space-y-2">
            {properties.map((p) => {
              const activeUnits = p.units.filter(u => !u.is_archived)
              const occupiedCount = activeUnits.filter(u => u.status === "occupied").length
              const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address_line1}, ${p.city}`)}`
              return (
                <div key={p.id} className="border border-border rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.address_line1}, {p.city}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activeUnits.length} {activeUnits.length === 1 ? "unit" : "units"} · {occupiedCount}/{activeUnits.length} occupied
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a href={mapsUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1">
                          <MapPin className="size-3" /> Maps
                        </Button>
                      </a>
                      <Link href={`/properties/${p.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2">→</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block">
        {properties.length > 0 && (
          <PortfolioMetrics
            propertyCount={properties.length}
            occupancyPct={occupancyPct}
            rentRollCents={rentRollCents}
            attentionCount={0}
          />
        )}

        <Suspense>
          <PropertyFilters view={view} />
        </Suspense>

        {properties.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-8 w-8 text-muted-foreground" />}
            title="No properties yet"
            description="Add your first property to get started."
          />
        ) : (
          <PropertyList properties={properties} view={view} tier={tier} totalUnitCount={totalUnitCount} />
        )}
      </div>
    </div>
  )
}
