"use client"

import { useState, useTransition } from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { UpgradeCta } from "@/components/shared/UpgradeCta"
import { UnitExpandPanel } from "./UnitExpandPanel"
import { AddUnitDialog } from "./AddUnitDialog"
import { updateUnitStatus } from "@/lib/actions/units"
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
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null)
  const [archivingUnitId, setArchivingUnitId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleUnit(unitId: string) {
    setExpandedUnitId((prev) => (prev === unitId ? null : unitId))
    // Reset archive confirmation when collapsing
    if (archivingUnitId && expandedUnitId !== unitId) {
      setArchivingUnitId(null)
    }
  }

  function handleArchiveUnit(unitId: string) {
    startTransition(async () => {
      const result = await updateUnitStatus(unitId, propertyId, "archived")
      if (result?.error) {
        toast.error(result.error)
      } else {
        setArchivingUnitId(null)
        setExpandedUnitId(null)
      }
    })
  }

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
              trigger={
                <Button size="sm">
                  + Add unit
                </Button>
              }
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
            const isExpanded = expandedUnitId === unit.id
            const isArchiving = archivingUnitId === unit.id
            const tenant = tenantByUnit[unit.id] ?? null
            const maintenanceCount = maintenanceByUnit[unit.id] ?? 0
            const statusKey = STATUS_MAP[unit.status] ?? "open"
            const description = getUnitDescription(unit, propertyType)

            return (
              <div key={unit.id} className="rounded-lg border border-border/60 overflow-hidden">
                {/* Clickable unit row */}
                <div
                  className={cn(
                    "border rounded-lg px-4 py-3 cursor-pointer hover:border-brand/40 transition-colors",
                    isExpanded && "border-brand/40 rounded-b-none"
                  )}
                  onClick={() => toggleUnit(unit.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleUnit(unit.id) }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center justify-between gap-4">
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
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Right: rent + chevron */}
                    <div className="flex items-center gap-2 shrink-0">
                      {unit.asking_rent_cents ? (
                        <span className="text-sm font-medium">{formatZAR(unit.asking_rent_cents)}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expand panel with animation */}
                <div
                  className={cn(
                    "grid transition-all duration-200",
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <UnitExpandPanel
                      unit={unit}
                      propertyId={propertyId}
                      propertyType={propertyType}
                      onArchive={() => setArchivingUnitId(unit.id)}
                    />

                    {/* Archive confirmation */}
                    {isArchiving && (
                      <div className="mx-4 mb-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
                        <p className="text-sm text-muted-foreground mb-3">
                          Archive this unit? It will be hidden from active lists.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setArchivingUnitId(null)}
                            disabled={isPending}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleArchiveUnit(unit.id)}
                            disabled={isPending}
                            className="bg-danger text-white hover:bg-danger/90"
                          >
                            {isPending ? "Archiving..." : "Archive unit"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
