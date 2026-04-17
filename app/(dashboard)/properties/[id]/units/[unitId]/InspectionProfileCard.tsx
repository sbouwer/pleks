"use client"

import { useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ClipboardList, Sparkles, Plus } from "lucide-react"
import { setupProfileFromTemplate } from "@/lib/actions/inspectionProfile"
import { toast } from "sonner"

interface ProfileRoom {
  room_type: string
  label: string
  sort_order: number
  is_custom: boolean
}

interface Props {
  unitId: string
  propertyId: string
  /** unit_type drives the "Set up from template" button — hide it if null */
  unitType: string | null | undefined
  initialRooms: ProfileRoom[]
}

export function InspectionProfileCard({ unitId, propertyId, unitType, initialRooms }: Readonly<Props>) {
  const rooms = initialRooms
  const [isPending, startTransition] = useTransition()

  const hasProfile = rooms.length > 0
  const inspectionNewUrl = `/inspections/new?property=${propertyId}&unit=${unitId}&type=pre_listing`

  function handleSetupFromTemplate() {
    startTransition(async () => {
      const result = await setupProfileFromTemplate(unitId, propertyId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Inspection checklist created")
        // Server action revalidates the path; force a reload to pick up new rooms
        globalThis.location.reload()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="size-5 shrink-0" />
            Inspection checklist
          </CardTitle>
          {hasProfile && unitType && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSetupFromTemplate}
              disabled={isPending}
            >
              <Sparkles className="size-3.5 mr-1.5" />
              Regenerate from template
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasProfile ? (
          <div>
            <div className="space-y-1.5">
              {rooms.map((room, i) => (
                <div
                  key={`${room.room_type}-${i}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <div className="size-1.5 rounded-full bg-brand shrink-0" />
                  <span>{room.label}</span>
                  {room.is_custom && (
                    <Badge variant="outline" className="text-[10px] py-0 h-4">
                      custom
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {rooms.length} room{rooms.length === 1 ? "" : "s"} · Used for move-in, periodic, and move-out inspections
            </p>
          </div>
        ) : (
          <div className="py-6 text-center">
            <ClipboardList className="size-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium mb-1">No checklist yet</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
              {unitType
                ? "Generate a room list from this unit's type and features, or conduct a pre-listing inspection to build it on-site."
                : "Set a unit type first to generate from template, or conduct a pre-listing inspection to build the checklist on-site."}
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              {unitType && (
                <Button size="sm" onClick={handleSetupFromTemplate} disabled={isPending}>
                  <Sparkles className="size-3.5 mr-1.5" />
                  {isPending ? "Setting up…" : "Set up from template"}
                </Button>
              )}
              <Button variant="outline" size="sm" render={<Link href={inspectionNewUrl} />}>
                <Plus className="size-3.5 mr-1.5" />
                Pre-listing inspection
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
