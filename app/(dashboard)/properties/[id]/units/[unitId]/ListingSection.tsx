"use client"

/**
 * Unit listing section — shown on unit detail page.
 * Shows active listing card or "Create listing" button.
 */

import { useState } from "react"
import { ListingCreateDialog } from "@/components/applications/ListingCreateDialog"
import { ListingCard } from "@/components/applications/ListingCard"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

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
}

export function ListingSection({ unit, property, orgId, activeListing }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div>
      {activeListing ? (
        <ListingCard
          listing={activeListing}
          unitLabel={unit.unit_number}
          propertyName={property.name}
        />
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-4">
          <div>
            <p className="text-sm font-medium">No active listing</p>
            <p className="text-xs text-muted-foreground mt-0.5">Create a listing to start receiving applications.</p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4 mr-1.5" />
            Create listing
          </Button>
        </div>
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
