"use client"

import { Button } from "@/components/ui/button"
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
        <Button size="sm" onClick={() => handleStatusChange("in_progress")}>
          Start Inspection
        </Button>
      )}
      {status === "in_progress" && (
        <Button size="sm" onClick={() => handleStatusChange("completed")}>
          {leaseType === "residential" ? "Complete & Open Dispute Window" : "Mark Complete"}
        </Button>
      )}
      {(status === "awaiting_tenant_review" || status === "dispute_resolved") && (
        <Button size="sm" onClick={() => handleStatusChange("finalised")}>
          Finalise Inspection
        </Button>
      )}
      {status === "completed" && leaseType === "commercial" && (
        <Button size="sm" onClick={() => handleStatusChange("finalised")}>
          Finalise
        </Button>
      )}
    </div>
  )
}
