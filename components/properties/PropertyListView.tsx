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
import { ArchivedPropertyList } from "./ArchivedPropertyList"
import { isInForceLease } from "@/lib/leases/rentRoll"
import type { PropertyListItem } from "./PropertyList"

interface Props {
  properties: PropertyListItem[]
  view: "list" | "cards"
  arrearsPct?: number
  archived?: boolean
  scope?: "mine" | "all"
  orgHasProperties?: boolean
}

export function PropertyListView({ properties, view, arrearsPct, archived, scope = "all", orgHasProperties }: Readonly<Props>) {
  const totalUnits = properties.reduce((sum, p) =>
    sum + p.units.filter(u => !u.deleted_at).length, 0)
  const occupiedUnits = properties.reduce((sum, p) =>
    sum + p.units.filter(u => !u.deleted_at && u.status === "occupied").length, 0)
  const rentRollCents = properties.reduce((sum, p) =>
    sum + p.units.filter(u => !u.deleted_at).reduce((us, u) => {
      const lease = u.leases.find(l => isInForceLease(l.status))
      return us + (lease?.rent_amount_cents ?? 0)
    }, 0), 0)
  // Potential income: in-force rent where let, asking rent where vacant.
  const potentialCents = properties.reduce((sum, p) =>
    sum + p.units.filter(u => !u.deleted_at).reduce((us, u) => {
      const lease = u.leases.find(l => isInForceLease(l.status))
      return us + (lease?.rent_amount_cents ?? u.asking_rent_cents ?? 0)
    }, 0), 0)
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  // My portfolio empty, but the org has properties → offer "View all" (ADDENDUM_TEAMS Layer 0). A Link,
  // not an onClick — this is a server component and the scope lives in the URL.
  if (properties.length === 0 && !archived && scope === "mine" && orgHasProperties) {
    return (
      <EmptyResourceState
        eyebrow="Portfolio"
        title="Properties"
        headline="Nothing in your portfolio"
        headerSub="These are the properties you manage. Switch to All to see the whole organisation's portfolio."
        emptyTitle="Nothing in your portfolio"
        emptySub="There are properties in your organisation — just none you manage."
        icon={<Home className="h-6 w-6" />}
        headerAction={<AddPropertyButton />}
        heroAction={
          <Link
            href="/properties?scope=all"
            className="inline-flex items-center rounded-[var(--r-button)] bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-primary"
          >
            View all
          </Link>
        }
      />
    )
  }

  if (properties.length === 0 && !archived) {
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

  // Archived view: status filter + soft-deleted properties with a Reactivate action (no KPI strip).
  if (archived) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ResourcePageHeader
          title="Properties"
          headline="Archived properties"
          sub="Properties you've archived — reactivate to bring them back to your portfolio."
          action={<AddPropertyButton />}
        />
        <Suspense>
          <PropertyFilters view={view} />
        </Suspense>
        <ArchivedPropertyList properties={properties} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeader
        title="Properties"
        headline="Your portfolio"
        sub="Every property and unit you manage — live occupancy and rent roll below."
        action={<AddPropertyButton />}
      />

      {/* Mobile property cards */}
      <div className="lg:hidden min-h-0 flex-1 overflow-auto">
        <div className="space-y-2">
            {properties.map((p) => {
              const activeUnits = p.units.filter(u => !u.deleted_at)
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
      <div className="hidden lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <PortfolioMetrics
          propertyCount={properties.length}
          unitCount={totalUnits}
          occupiedUnits={occupiedUnits}
          occupancyPct={occupancyPct}
          rentRollCents={rentRollCents}
          potentialCents={potentialCents}
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
