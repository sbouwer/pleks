"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatZAR } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { getUnitDescription } from "@/lib/units/typeAwareFields"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UnitTabData {
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
  furnishing_status?: string | null
  asking_rent_cents: number | null
  deposit_amount_cents: number | null
  features: string[]
  assigned_agent_id: string | null
  building_id: string | null
}

export interface BuildingTabData {
  id: string
  name: string
  building_type: string
  is_primary: boolean
  is_visible_in_ui: boolean
}

interface UnitsTabProps {
  units: UnitTabData[]
  archivedUnits: UnitTabData[]
  buildings: BuildingTabData[]
  propertyId: string
  propertyName: string
  propertyType: string
  tier: string
  tenantByUnit: Record<string, { name: string }>
  maintenanceByUnit: Record<string, number>
}

// ── Unit card ─────────────────────────────────────────────────────────────────

function UnitCard({ unit, propertyId, propertyType, tenant, maintenanceCount }: Readonly<{
  unit: UnitTabData
  propertyId: string
  propertyType: string
  tenant: { name: string } | null
  maintenanceCount: number
}>) {
  const isVacant   = unit.status === "vacant"
  const isOccupied = unit.status === "occupied" || unit.status === "notice"
  const description = getUnitDescription(unit, propertyType)

  // Check for arrears via maintenanceCount sign (maintenance > 10 used as arrears proxy)
  // Real arrears tinting is handled by a separate arrears prop if needed.
  const borderClass = isVacant
    ? "border-amber-500/40 hover:border-amber-500/60"
    : "border-border/60 hover:border-brand/40"

  let tenantLabel: string
  if (isVacant)                    tenantLabel = "Vacant"
  else if (isOccupied && tenant)   tenantLabel = tenant.name
  else                             tenantLabel = "—"

  let statusClass: string
  if (isOccupied)      statusClass = "bg-emerald-500/10 text-emerald-600"
  else if (isVacant)   statusClass = "bg-amber-500/10 text-amber-600"
  else                 statusClass = "bg-muted text-muted-foreground"

  let statusLabel: string
  if (unit.status === "notice")  statusLabel = "Notice"
  else if (isOccupied)           statusLabel = "Occupied"
  else if (isVacant)             statusLabel = "Vacant"
  else                           statusLabel = unit.status

  return (
    <Link
      href={`/properties/${propertyId}/units/${unit.id}`}
      className={cn(
        "flex items-start justify-between gap-4 px-4 py-3 rounded-lg border transition-colors hover:bg-surface",
        borderClass,
      )}
    >
      <div className="min-w-0 flex-1">
        {/* Line 1 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{unit.unit_number}</span>
          {description && (
            <span className="text-xs text-muted-foreground hidden sm:block">{description}</span>
          )}
          {maintenanceCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning">
              {maintenanceCount} maint.
            </span>
          )}
        </div>
        {/* Line 2 */}
        <p className={cn("text-xs mt-0.5", isVacant ? "text-amber-500" : "text-muted-foreground")}>
          {tenantLabel}
        </p>
      </div>
      {/* Right: status + rent */}
      <div className="shrink-0 text-right">
        <span className={cn(
          "inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1",
          statusClass,
        )}>
          {statusLabel}
        </span>
        {unit.asking_rent_cents ? (
          <p className="text-xs font-medium">{formatZAR(unit.asking_rent_cents)}</p>
        ) : null}
      </div>
    </Link>
  )
}

// ── Building section (collapsible) ────────────────────────────────────────────

function BuildingSection({ building, units, propertyId, propertyType, tenantByUnit, maintenanceByUnit, defaultOpen }: Readonly<{
  building: BuildingTabData
  units: UnitTabData[]
  propertyId: string
  propertyType: string
  tenantByUnit: Record<string, { name: string }>
  maintenanceByUnit: Record<string, number>
  defaultOpen: boolean
}>) {
  const [open, setOpen] = useState(defaultOpen)
  const occupied = units.filter((u) => u.status === "occupied" || u.status === "notice").length

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-elevated transition-colors text-left"
      >
        <div>
          <span className="font-medium text-sm">{building.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {units.length} unit{units.length === 1 ? "" : "s"} · {occupied} occupied
          </span>
        </div>
        {open
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        }
      </button>
      {open && (
        <div className="px-4 py-3 space-y-2">
          {units.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No units in this building.</p>
          ) : (
            units.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                propertyId={propertyId}
                propertyType={propertyType}
                tenant={tenantByUnit[unit.id] ?? null}
                maintenanceCount={maintenanceByUnit[unit.id] ?? 0}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function UnitsTab({
  units,
  archivedUnits,
  buildings,
  propertyId,
  propertyName,
  propertyType,
  tier,
  tenantByUnit,
  maintenanceByUnit,
}: Readonly<UnitsTabProps>) {
  const isOwner = tier === "owner"
  const visibleBuildings = buildings.filter((b) => b.is_visible_in_ui)
  const isMultiBuilding  = visibleBuildings.length >= 2

  return (
    <div className="space-y-6">
      {/* Action bar */}
      {!isOwner && (
        <div className="flex items-center gap-2">
          <Button size="sm" render={<Link href={`/properties/${propertyId}/units/new`} />}>
            + Add unit
          </Button>
          <Button size="sm" variant="outline" render={<Link href={`/properties/${propertyId}/buildings/new`} />}>
            + Add building
          </Button>
        </div>
      )}

      {/* No units */}
      {units.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No units added yet.</p>
      )}

      {/* Multi-building: collapsible sections */}
      {isMultiBuilding && units.length > 0 && (
        <div className="space-y-3">
          {visibleBuildings.map((building, idx) => {
            const buildingUnits = units.filter((u) => u.building_id === building.id)
            return (
              <BuildingSection
                key={building.id}
                building={building}
                units={buildingUnits}
                propertyId={propertyId}
                propertyType={propertyType}
                tenantByUnit={tenantByUnit}
                maintenanceByUnit={maintenanceByUnit}
                defaultOpen={idx === 0}
              />
            )
          })}
          {/* Unassigned units */}
          {units.some((u) => !u.building_id) && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="px-4 py-3 bg-surface">
                <span className="text-sm font-medium text-muted-foreground">Unassigned</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {units.filter((u) => !u.building_id).map((unit) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    propertyId={propertyId}
                    propertyType={propertyType}
                    tenant={tenantByUnit[unit.id] ?? null}
                    maintenanceCount={maintenanceByUnit[unit.id] ?? 0}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Single-building / no building: flat list */}
      {!isMultiBuilding && units.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            {propertyName} · {units.length} unit{units.length === 1 ? "" : "s"} · {units.filter((u) => u.status === "occupied").length} occupied · {units.filter((u) => u.status === "vacant").length} vacant
          </p>
          <div className="space-y-2">
            {units.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                propertyId={propertyId}
                propertyType={propertyType}
                tenant={tenantByUnit[unit.id] ?? null}
                maintenanceCount={maintenanceByUnit[unit.id] ?? 0}
              />
            ))}
          </div>
        </div>
      )}

      {/* Archived units */}
      {archivedUnits.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Archived ({archivedUnits.length})
          </p>
          <div className="space-y-2">
            {archivedUnits.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-surface text-muted-foreground text-sm">
                <span>{unit.unit_number}</span>
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">Archived</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
