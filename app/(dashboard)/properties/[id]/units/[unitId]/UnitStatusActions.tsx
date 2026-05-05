"use client"

/**
 * app/(dashboard)/properties/[id]/units/[unitId]/UnitStatusActions.tsx — Unit status transition buttons (vacant/maintenance/archived)
 *
 * Route:  /properties/[id]/units/[unitId]
 * Auth:   gateway
 * Data:   currentStatus passed as prop; updateUnitStatus server action; router.refresh() on success
 */
import { ActionButton } from "@/components/ui/actions"
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
          <ActionButton tone="primary" onClick={() => handleStatusChange("maintenance", "Marked for maintenance")}>
            Mark Under Maintenance
          </ActionButton>
          <ActionButton tone="secondary" onClick={() => handleStatusChange("archived", "Archived by user")}>
            Archive Unit
          </ActionButton>
        </>
      )}
      {currentStatus === "occupied" && (
        <ActionButton tone="secondary" disabled>
          Active Lease — Manage via Leases
        </ActionButton>
      )}
      {currentStatus === "notice" && (
        <ActionButton tone="secondary" disabled>
          Notice Period — View Lease
        </ActionButton>
      )}
      {currentStatus === "maintenance" && (
        <ActionButton tone="primary" onClick={() => handleStatusChange("vacant", "Maintenance complete")}>
          Mark Available
        </ActionButton>
      )}
      {currentStatus === "archived" && (
        <ActionButton tone="primary" onClick={() => handleStatusChange("vacant", "Unarchived by user")}>
          Unarchive Unit
        </ActionButton>
      )}
    </div>
  )
}
