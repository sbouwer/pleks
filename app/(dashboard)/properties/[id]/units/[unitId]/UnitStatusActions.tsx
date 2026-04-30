"use client"

/**
 * app/(dashboard)/properties/[id]/units/[unitId]/UnitStatusActions.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { Button } from "@/components/ui/button"
import { updateUnitStatus } from "@/lib/actions/units"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface UnitStatusActionsProps {
  readonly unitId: string
  readonly propertyId: string
  readonly currentStatus: string
}

export function UnitStatusActions({ unitId, propertyId, currentStatus }: UnitStatusActionsProps) {
  const router = useRouter()

  async function handleStatusChange(newStatus: string, reason?: string) {
    const result = await updateUnitStatus(unitId, propertyId, newStatus, reason)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success(`Unit status updated to ${newStatus}`)
      router.refresh()
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {currentStatus === "vacant" && (
        <>
          <Button size="sm" onClick={() => handleStatusChange("maintenance", "Marked for maintenance")}>
            Mark Under Maintenance
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleStatusChange("archived", "Archived by user")}>
            Archive Unit
          </Button>
        </>
      )}
      {currentStatus === "occupied" && (
        <Button size="sm" variant="outline" disabled>
          Active Lease — Manage via Leases
        </Button>
      )}
      {currentStatus === "notice" && (
        <Button size="sm" variant="outline" disabled>
          Notice Period — View Lease
        </Button>
      )}
      {currentStatus === "maintenance" && (
        <Button size="sm" onClick={() => handleStatusChange("vacant", "Maintenance complete")}>
          Mark Available
        </Button>
      )}
      {currentStatus === "archived" && (
        <Button size="sm" onClick={() => handleStatusChange("vacant", "Unarchived by user")}>
          Unarchive Unit
        </Button>
      )}
    </div>
  )
}
