"use client"

import Link from "next/link"
import { Wrench } from "lucide-react"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"

function getUnitDescription(unit: { bedrooms: number | null; bathrooms: number | null; size_m2: number | null }): string | null {
  if (unit.bedrooms !== null) {
    const sizeStr = unit.size_m2 ? ` · ${unit.size_m2}m²` : ""
    return `${unit.bedrooms} bed · ${unit.bathrooms ?? 0} bath${sizeStr}`
  }
  if (unit.size_m2) return `${unit.size_m2}m²`
  return null
}

const STATUS_MAP: Record<string, "active" | "pending" | "open" | "scheduled" | "arrears"> = {
  occupied: "active",
  notice: "pending",
  vacant: "open",
  maintenance: "scheduled",
}

interface UnitRowProps {
  unit: {
    id: string
    unit_number: string
    bedrooms: number | null
    bathrooms: number | null
    size_m2: number | null
    status: string
    asking_rent_cents: number | null
  }
  propertyId: string
  tenant: {
    tenantId: string
    contactId: string
    name: string
    initials: string
  } | null
  managingAgent: {
    id: string
    name: string
    initials: string
    inherited: boolean
  } | null
  maintenanceCount: number
}

export function UnitRow({ unit, propertyId, tenant, managingAgent, maintenanceCount }: Readonly<UnitRowProps>) {
  return (
    <Link href={`/properties/${propertyId}/units/${unit.id}`}>
      <div className="border rounded-lg p-4 hover:border-brand/50 transition-colors cursor-pointer bg-card">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1.5fr_auto] gap-4 items-center">

          {/* Column 1: Unit identity */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{unit.unit_number}</span>
              <StatusBadge status={STATUS_MAP[unit.status] || "open"} />
              {maintenanceCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-1">
                  <Wrench className="h-3 w-3" />
                  {maintenanceCount} active
                </span>
              )}
            </div>
            {getUnitDescription(unit) && (
              <p className="text-sm text-muted-foreground mt-0.5">{getUnitDescription(unit)}</p>
            )}
          </div>

          {/* Column 2: Tenant */}
          <div>
            {tenant ? (
              <Link
                href={`/tenants/${tenant.tenantId}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 hover:underline w-fit"
              >
                <div className="h-8 w-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-medium shrink-0">
                  {tenant.initials}
                </div>
                <div>
                  <p className="text-sm font-medium">{tenant.name}</p>
                  <p className="text-xs text-muted-foreground">Tenant</p>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground italic">No tenant</p>
            )}
          </div>

          {/* Column 3: Agent — display only; assignment happens on unit detail page */}
          <div>
            {managingAgent ? (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-medium shrink-0">
                  {managingAgent.initials}
                </div>
                <div>
                  <p className="text-sm font-medium">{managingAgent.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {managingAgent.inherited ? "Property manager" : "Letting agent"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No agent</p>
            )}
          </div>

          {/* Column 4: Rent */}
          <div className="text-right">
            {unit.asking_rent_cents ? (
              <>
                <p className="font-medium">{formatZAR(unit.asking_rent_cents)}</p>
                <p className="text-xs text-muted-foreground">/month</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>

        </div>
      </div>
    </Link>
  )
}
