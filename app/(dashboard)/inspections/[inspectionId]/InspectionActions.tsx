"use client"

/**
 * app/(dashboard)/inspections/[inspectionId]/InspectionActions.tsx — Status-transition action buttons for an inspection (start, complete, finalise)
 *
 * Route:  /inspections/[inspectionId]
 * Auth:   gateway (dashboard layout)
 * Data:   updateInspectionStatus server action
 * Notes:  Available actions depend on current status and lease type (residential opens dispute window on complete)
 */
import { ActionButton } from "@/components/ui/actions"
import { updateInspectionStatus } from "@/lib/actions/inspections"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface InspectionActionsProps {
  readonly inspectionId: string
  readonly status: string
  readonly leaseType: string
}

export function InspectionActions({ inspectionId, status, leaseType }: InspectionActionsProps) {
  const router = useRouter()

  async function handleStatusChange(newStatus: string) {
    const result = await updateInspectionStatus(inspectionId, newStatus)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success(`Inspection status updated`)
      router.refresh()
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "scheduled" && (
        <ActionButton tone="primary" onClick={() => handleStatusChange("in_progress")}>
          Start Inspection
        </ActionButton>
      )}
      {status === "in_progress" && (
        <ActionButton tone="primary" onClick={() => handleStatusChange("completed")}>
          {leaseType === "residential" ? "Complete & Open Dispute Window" : "Mark Complete"}
        </ActionButton>
      )}
      {(status === "awaiting_tenant_review" || status === "dispute_resolved") && (
        <ActionButton tone="primary" onClick={() => handleStatusChange("finalised")}>
          Finalise Inspection
        </ActionButton>
      )}
      {status === "completed" && leaseType === "commercial" && (
        <ActionButton tone="primary" onClick={() => handleStatusChange("finalised")}>
          Finalise
        </ActionButton>
      )}
    </div>
  )
}
