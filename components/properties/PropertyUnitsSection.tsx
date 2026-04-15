"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { UpgradeCta } from "@/components/shared/UpgradeCta"
import { AddUnitDialog } from "./AddUnitDialog"
import { getUnitDescription } from "@/lib/units/typeAwareFields"
import { formatZAR } from "@/lib/constants"

const STATUS_MAP: Record<string, "active" | "pending" | "open" | "scheduled" | "arrears" | "cancelled"> = {
  occupied: "active",
  notice: "pending",
  vacant: "open",
  maintenance: "scheduled",
  archived: "cancelled",
}

interface UnitData {
  id: string
  unit_number: string
  status: string
  is_archived: boolean
  bedrooms: number | null
  bathrooms: number | null
  size_m2: number | null
  floor: number | null
  parking_bays: number | null
  furnished: boolean | null
  asking_rent_cents: number | null
  deposit_amount_cents: number | null
  features: string[]
  assigned_agent_id: string | null
}

interface PropertyUnitsSectionProps {
  units: UnitData[]
  archivedUnits: UnitData[]
  propertyId: string
  propertyName: string
  propertyCity?: string | null
  propertyType: string
  tier: string
  managingAgentId: string | null
  agentMap: Record<string, { id: string; name: string; initials: string; role: string; inherited?: boolean }>
  tenantByUnit: Record<string, { tenantId: string; contactId: string; name: string; initials: string }>
  maintenanceByUnit: Record<string, number>
  orgId: string
}

export function PropertyUnitsSection({
  units,
  archivedUnits,
  propertyId,
  propertyType,
  tier,
  tenantByUnit,
  maintenanceByUnit,
}: PropertyUnitsSectionProps) {
  const isOwner = tier === "owner"

  return (
    <div className="mt-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        {isOwner ? (
          <h2 className="text-lg font-medium">Your unit</h2>
        ) : (
          <>
            <h2 className="text-lg font-medium">Units ({units.length})</h2>
            <AddUnitDialog
              propertyId={propertyId}
              propertyType={propertyType}
              trigger={<Button size="sm">+ Add unit</Button>}
            />
          </>
        )}
      </div>

      {/* Active units */}
      {units.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No units added yet.</p>
      ) : (
        <div className="space-y-2">
          {units.map((unit) => {
            const tenant = tenantByUnit[unit.id] ?? null
            const maintenanceCount = maintenanceByUnit[unit.id] ?? 0
            const statusKey = STATUS_MAP[unit.status] ?? "open"
            const description = getUnitDescription(unit, propertyType)

            return (
              <Link
                key={unit.id}
                href={`/properties/${propertyId}/units/${unit.id}`}
                className={cn(
                  "flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-border/60",
                  "hover:border-brand/40 hover:bg-surface transition-colors"
                )}
              >
                {/* Left: unit number + status + description */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-medium whitespace-nowrap">{unit.unit_number}</span>
                  <StatusBadge status={statusKey} />
                  {maintenanceCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning whitespace-nowrap">
                      {maintenanceCount} maintenance
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground truncate hidden sm:block">
                    {description}
                  </span>
                </div>

                {/* Middle: tenant */}
                <div className="hidden md:block shrink-0">
                  {tenant ? (
                    <span className="text-sm">{tenant.name}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Vacant</span>
                  )}
                </div>

                {/* Right: rent */}
                <div className="shrink-0">
                  {unit.asking_rent_cents ? (
                    <span className="text-sm font-medium">{formatZAR(unit.asking_rent_cents)}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Owner at limit upgrade CTA */}
      {isOwner && (
        <UpgradeCta
          title="Managing more properties?"
          description="Upgrade to Steward to manage up to 20 units."
          dismissKey="upgrade-cta-units"
        />
      )}

      {/* Archived units */}
      {archivedUnits.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Archived ({archivedUnits.length})
          </h3>
          <div className="space-y-2">
            {archivedUnits.map((unit) => (
              <div
                key={unit.id}
                className="flex items-center justify-between p-3 rounded-lg bg-surface text-muted-foreground"
              >
                <span className="text-sm">{unit.unit_number}</span>
                <StatusBadge status="cancelled" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
