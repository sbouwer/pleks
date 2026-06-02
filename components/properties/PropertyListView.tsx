/**
 * components/properties/PropertyListView.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import Link from "next/link"
import { MapPin, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AddPropertyButton } from "./AddPropertyButton"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
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
  const rentRollLabel = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(rentRollCents / 100)

  if (properties.length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Portfolio"
        title="Properties"
        headline="No properties yet"
        headerSub="Add your first property to start building leases, statements and maintenance."
        emptyTitle="Your portfolio is empty"
        emptySub="It takes about two minutes to add your first one."
        icon={<Home className="h-6 w-6" />}
        headerAction={<AddPropertyButton />}
        heroAction={<AddPropertyButton variant="hero" label="Add your first property" showPlus={false} />}
      />
    )
  }

  return (
    <div>
      <ResourcePageHeader
        title="Properties"
        headline="Your portfolio"
        sub={
          <>
            <span className="hidden lg:block">
              {properties.length} {properties.length === 1 ? "property" : "properties"} · {totalUnits} active {totalUnits === 1 ? "unit" : "units"} · {occupancyPct}% occupied · {rentRollLabel}/mo rent roll
            </span>
            <span className="lg:hidden">
              {properties.length} {properties.length === 1 ? "property" : "properties"} · {occupancyPct}% occupied
            </span>
          </>
        }
        action={<AddPropertyButton />}
      />

      {/* Mobile property cards */}
      <div className="lg:hidden">
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
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block">
        <PortfolioMetrics
          propertyCount={properties.length}
          occupancyPct={occupancyPct}
          rentRollCents={rentRollCents}
          attentionCount={0}
        />

        <Suspense>
          <PropertyFilters view={view} />
        </Suspense>

        <PropertyList properties={properties} view={view} tier={tier} totalUnitCount={totalUnitCount} />
      </div>
    </div>
  )
}
