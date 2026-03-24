"use client"

import { Button } from "@/components/ui/button"
import { updateMaintenanceStatus } from "@/lib/actions/maintenance"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface MaintenanceActionsProps {
  readonly requestId: string
  readonly status: string
}

export function MaintenanceActions({ requestId, status }: MaintenanceActionsProps) {
  const router = useRouter()

  async function handleStatus(newStatus: string) {
    const result = await updateMaintenanceStatus(requestId, newStatus)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Status updated")
      router.refresh()
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending_review" && (
        <>
          <Button size="sm" onClick={() => handleStatus("approved")}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => handleStatus("rejected")}>Reject</Button>
        </>
      )}
      {status === "approved" && (
        <Button size="sm" onClick={() => handleStatus("work_order_sent")}>Send Work Order</Button>
      )}
      {status === "pending_completion" && (
        <Button size="sm" onClick={() => handleStatus("completed")}>Sign Off</Button>
      )}
      {status === "completed" && (
        <Button size="sm" variant="outline" onClick={() => handleStatus("closed")}>Close</Button>
      )}
      {!["completed", "closed", "cancelled", "rejected"].includes(status) && (
        <Button size="sm" variant="outline" onClick={() => handleStatus("cancelled")}>Cancel</Button>
      )}
    </div>
  )
}
