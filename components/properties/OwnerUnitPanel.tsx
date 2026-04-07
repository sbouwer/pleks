"use client"

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
