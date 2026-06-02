/**
 * components/properties/PropertyCards.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import Link from "next/link"
import { Home } from "lucide-react"
import { AddPropertyButton } from "./AddPropertyButton"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
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
  const unitLimit = TIER_LIMITS[tier].leases

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
        sub={`${properties.length} ${properties.length === 1 ? "property" : "properties"} · ${totalUnits} active ${totalUnits === 1 ? "unit" : "units"} · ${occupancyPct}% occupied · ${rentRollLabel}/mo rent roll`}
        action={<AddPropertyButton />}
      />

      <PortfolioMetrics
        propertyCount={properties.length}
        occupancyPct={occupancyPct}
        rentRollCents={rentRollCents}
        attentionCount={0}
      />

      {/* Near-limit warning for steward */}
      {unitLimit != null && totalUnitCount >= unitLimit - 3 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-600">
          <span>
            {totalUnitCount}/{unitLimit} units used on your plan.{" "}
            <Link href="/settings/subscription" className="underline underline-offset-2 hover:text-amber-700">
              Upgrade to Portfolio →
            </Link>
          </span>
        </div>
      )}

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
    </div>
  )
}
