/**
 * components/properties/PropertyListView.tsx — Portfolio/Firm tier properties list view (header, metrics, toolbar, list)
 *
 * Route:  /properties (Portfolio / Firm tier)
 * Auth:   rendered by properties/page.tsx under gatewaySSR
 * Data:   pre-filtered PropertyListItem[] from the server page (q/status applied server-side)
 * Notes:  Empty state swaps to EmptyResourceState. Desktop branch renders <PropertyFilters>
 *         (shared ListToolbar) then <PropertyList>; both consume the URL-driven `view`.
 */
import Link from "next/link"
import { MapPin, Home } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { AddPropertyButton } from "./AddPropertyButton"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { Suspense } from "react"
import { PortfolioMetrics } from "./PropertyMetrics"
import { PropertyFilters } from "./PropertyFilters"
import { PropertyList } from "./PropertyList"
import type { PropertyListItem } from "./PropertyList"

interface Props {
  properties: PropertyListItem[]
  view: "list" | "cards"
  arrearsPct?: number
}

export function PropertyListView({ properties, view, arrearsPct }: Readonly<Props>) {
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
        sub="Every property and unit you manage — live occupancy and rent roll below."
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
                        <ActionButton size="sm" tone="secondary" icon={<MapPin className="size-3" />} className="h-7 text-xs px-2.5 gap-1">
                          Maps
                        </ActionButton>
                      </a>
                      <Link href={`/properties/${p.id}`}>
                        <ActionButton size="sm" tone="secondary" className="h-7 text-xs px-2">→</ActionButton>
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
          unitCount={totalUnits}
          occupiedUnits={occupiedUnits}
          occupancyPct={occupancyPct}
          rentRollCents={rentRollCents}
          arrearsPct={arrearsPct}
        />

        <Suspense>
          <PropertyFilters view={view} />
        </Suspense>

        <PropertyList properties={properties} view={view} />
      </div>
    </div>
  )
}
