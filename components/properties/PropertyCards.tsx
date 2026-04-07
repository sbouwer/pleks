import Link from "next/link"
import { Plus, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { PortfolioMetrics } from "./PropertyMetrics"
import { PropertyCard } from "./PropertyCard"
import { TIER_LIMITS } from "@/lib/constants"
import type { Tier } from "@/lib/constants"

export interface PropertyCardData {
  id: string
  name: string
  type: string
  address_line1: string
  city: string
  is_sectional_title?: boolean | null
  units: { id: string; status: string; is_archived: boolean; leases: { rent_amount_cents: number; status: string }[] }[]
}

interface Props {
  readonly properties: PropertyCardData[]
  readonly tier: Tier
  readonly totalUnitCount: number
}

export function PropertyCards({ properties, tier, totalUnitCount }: Props) {
  const unitLimit = TIER_LIMITS[tier].units

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

      {/* Near-limit warning for steward */}
      {unitLimit != null && totalUnitCount >= unitLimit - 3 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-600">
          <span>
            {totalUnitCount}/{unitLimit} units used on your plan.{" "}
            <Link href="/settings/billing" className="underline underline-offset-2 hover:text-amber-700">
              Upgrade to Portfolio →
            </Link>
          </span>
        </div>
      )}

      {properties.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8 text-muted-foreground" />}
          title="No properties yet"
          description="Add your first property to get started."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.map((p) => {
            const activeUnits = p.units.filter(u => !u.is_archived)
            const occupied = activeUnits.filter(u => u.status === "occupied").length
            const rentRoll = activeUnits.reduce((sum, u) => {
              const activeLease = u.leases.find(l => l.status === "active")
              return sum + (activeLease?.rent_amount_cents ?? 0)
            }, 0)
            return (
              <PropertyCard
                key={p.id}
                id={p.id}
                name={p.name}
                type={p.type}
                addressLine1={p.address_line1}
                city={p.city}
                isSectionalTitle={p.is_sectional_title ?? false}
                totalUnits={activeUnits.length}
                occupiedUnits={occupied}
                rentRollCents={rentRoll}
                attentionCount={0}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
