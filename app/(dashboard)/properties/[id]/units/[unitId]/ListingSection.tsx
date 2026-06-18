"use client"

/**
 * Unit listing section — shown on unit detail page.
 * Shows active listing card or "Create listing" button.
 */

import { useState } from "react"
import { ListingCreateDialog } from "@/components/applications/ListingCreateDialog"
import { ListingCard } from "@/components/applications/ListingCard"
import { MomentFloorChecklist } from "@/components/properties/MomentFloorChecklist"
import { ActionButton } from "@/components/ui/actions"
import { Plus } from "lucide-react"
import type { MomentCompleteness } from "@/lib/properties/journeyCompleteness"

interface Listing {
  id: string
  public_slug: string | null
  status: "draft" | "active" | "paused" | "filled" | "expired"
  asking_rent_cents: number
  available_from: string | null
  views_count: number | null
  applications_count: number | null
  created_at: string
}

interface Props {
  unit: { id: string; unit_number: string; asking_rent_cents?: number | null }
  property: { id: string; name: string; city?: string | null }
  orgId: string
  activeListing: Listing | null
  listingFloor: MomentCompleteness
}

export function ListingSection({ unit, property, orgId, activeListing, listingFloor }: Readonly<Props>) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="space-y-3">
      {activeListing ? (
        <ListingCard
          listing={activeListing}
          unitLabel={unit.unit_number}
          propertyName={property.name}
        />
      ) : (
        <>
          <MomentFloorChecklist completeness={listingFloor} heading="To advertise this unit" />
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-4">
            <div>
              <p className="text-sm font-medium">No active listing</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create a listing to start receiving applications.</p>
            </div>
            <ActionButton tone="primary" icon={<Plus className="size-4" />} onClick={() => setDialogOpen(true)}>
              Create listing
            </ActionButton>
          </div>
        </>
      )}

      <ListingCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        unit={unit}
        property={property}
        orgId={orgId}
      />
    </div>
  )
}
