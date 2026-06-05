"use client"

/**
 * app/(dashboard)/properties/[id]/units/[unitId]/UnitStatusActions.tsx — unit occupancy + archive controls
 *
 * Route:  /properties/[id]/units/[unitId]
 * Auth:   gateway
 * Data:   currentStatus + isArchived props; updateUnitStatus / archiveUnit / restoreUnit server actions
 * Notes:  Occupancy (status) and archive (deleted_at) are orthogonal (D-1) — status is vacant/occupied/
 *         notice/maintenance only; archive is its own action. An in-force lease blocks archive (the
 *         DeleteButton dialog morphs to an acknowledge view with the reason).
 */
import { useTransition } from "react"
import { ActionButton, DeleteButton } from "@/components/ui/actions"
import { Archive } from "lucide-react"
import { updateUnitStatus, archiveUnit, restoreUnit } from "@/lib/actions/units"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface UnitStatusActionsProps {
  readonly unitId: string
  readonly propertyId: string
  readonly currentStatus: string
  readonly isArchived: boolean
}

export function UnitStatusActions({ unitId, propertyId, currentStatus, isArchived }: UnitStatusActionsProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function handleStatusChange(newStatus: string, reason?: string) {
    const result = await updateUnitStatus(unitId, propertyId, newStatus, reason)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success(`Unit status updated to ${newStatus}`)
      router.refresh()
    }
  }

  function handleRestore() {
    startTransition(async () => {
      const result = await restoreUnit(unitId, propertyId)
      if (result?.error) { toast.error(result.error); return }
      toast.success("Unit restored")
      router.refresh()
    })
  }

  // Archived: the only action is to bring it back.
  if (isArchived) {
    return (
      <ActionButton tone="primary" onClick={handleRestore}>
        Restore unit
      </ActionButton>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentStatus === "vacant" && (
        <ActionButton tone="primary" onClick={() => handleStatusChange("maintenance", "Marked for maintenance")}>
          Mark Under Maintenance
        </ActionButton>
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

      {/* Archive (deleted_at) — distinct from occupancy. In-force lease blocks it (handled in-dialog). */}
      <DeleteButton
        mode="label"
        icon={Archive}
        label="Archive unit"
        confirmLabel="Archive"
        title="Archive this unit?"
        description="It's retired from active lists but kept (and restorable) — leases, inspections and history stay intact."
        onConfirm={async () => {
          const result = await archiveUnit(unitId, propertyId)
          if (result?.error) return { blocked: result.error }
          toast.success("Unit archived")
          router.refresh()
        }}
      />
    </div>
  )
}
