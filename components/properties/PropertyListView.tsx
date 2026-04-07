import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { Building2 } from "lucide-react"
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

export function PropertyListView({ properties, view, tier, totalUnitCount }: Props) {
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
            <p className="text-sm text-muted-foreground mt-1">
              {properties.length} {properties.length === 1 ? "property" : "properties"} &middot;{" "}
              {totalUnits} active {totalUnits === 1 ? "unit" : "units"} &middot;{" "}
              {occupancyPct}% occupied &middot;{" "}
              {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(rentRollCents / 100)}/mo rent roll
            </p>
          )}
        </div>
        <Button render={<Link href="/properties/new" />}>
          <Plus className="size-4 mr-1" /> Add Property
        </Button>
      </div>

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
  )
}
