"use client"

import Link from "next/link"
import { formatZAR } from "@/lib/constants"
import { getVisibleFields } from "@/lib/units/typeAwareFields"
import { UnitFeatureToggles } from "./UnitFeatureToggles"

interface UnitExpandPanelProps {
  unit: {
    id: string
    unit_number: string
    bedrooms: number | null
    bathrooms: number | null
    size_m2: number | null
    floor: number | null
    parking_bays: number | null
    furnished: boolean | null
    asking_rent_cents: number | null
    deposit_amount_cents: number | null
    features: string[]
    status: string
  }
  propertyId: string
  propertyType: string
  onArchive: () => void
  hideArchive?: boolean
  hasActiveLease?: boolean
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

export function UnitExpandPanel({ unit, propertyId, propertyType, onArchive, hideArchive = false, hasActiveLease = false }: UnitExpandPanelProps) {
  const fields = getVisibleFields(propertyType as "residential" | "commercial" | "mixed")

  const floorLabel = unit.floor == null
    ? null
    : unit.floor === 0
    ? "Ground floor"
    : `Floor ${unit.floor}`

  return (
    <div className="border-t border-border/40 bg-surface/30 px-4 py-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Left: Unit details */}
        <div>
          {fields.bedrooms && <DetailRow label="Bedrooms" value={unit.bedrooms} />}
          {fields.bathrooms && <DetailRow label="Bathrooms" value={unit.bathrooms} />}
          {unit.size_m2 != null && <DetailRow label="Size" value={`${unit.size_m2} m²`} />}
          {fields.floor && floorLabel && <DetailRow label="Floor" value={floorLabel} />}
          {unit.parking_bays != null && unit.parking_bays > 0 && (
            <DetailRow label="Parking" value={`${unit.parking_bays} bay${unit.parking_bays !== 1 ? "s" : ""}`} />
          )}
          {fields.furnished && unit.furnished != null && (
            <DetailRow label="Furnished" value={unit.furnished ? "Yes" : "No"} />
          )}
          {unit.asking_rent_cents != null && (
            <DetailRow label="Asking rent" value={formatZAR(unit.asking_rent_cents)} />
          )}
          {unit.deposit_amount_cents != null && (
            <DetailRow label="Deposit" value={formatZAR(unit.deposit_amount_cents)} />
          )}
        </div>

        {/* Right: Feature toggles */}
        <div>
          <UnitFeatureToggles
            unitId={unit.id}
            propertyId={propertyId}
            features={unit.features ?? []}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/30 pt-3">
        <Link
          href={`/properties/${propertyId}/units/${unit.id}/edit`}
          className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:border-border transition-colors"
        >
          Edit unit
        </Link>
        {!hasActiveLease && (
          <Link
            href={`/leases/new?unit=${unit.id}`}
            className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:border-border transition-colors"
          >
            Create lease
          </Link>
        )}
        <Link
          href={`/inspections/new?unit=${unit.id}`}
          className="rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:border-border transition-colors"
        >
          Schedule inspection
        </Link>
        {!hideArchive && (
          <button
            type="button"
            onClick={onArchive}
            className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs text-danger hover:bg-danger/5 transition-colors ml-auto"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  )
}
