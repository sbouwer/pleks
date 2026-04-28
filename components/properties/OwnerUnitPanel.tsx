"use client"

/**
 * components/properties/OwnerUnitPanel.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { UnitExpandPanel } from "./UnitExpandPanel"

interface Props {
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
  hasActiveLease: boolean
}

export function OwnerUnitPanel({ unit, propertyId, propertyType, hasActiveLease }: Readonly<Props>) {
  return (
    <UnitExpandPanel
      unit={unit}
      propertyId={propertyId}
      propertyType={propertyType}
      onArchive={() => {}}
      hideArchive
      hasActiveLease={hasActiveLease}
    />
  )
}
