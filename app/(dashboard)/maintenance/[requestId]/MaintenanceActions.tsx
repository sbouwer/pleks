"use client"

import { Button } from "@/components/ui/button"
import { SignOffCard } from "@/components/maintenance/SignOffCard"
import { updateMaintenanceStatus } from "@/lib/actions/maintenance"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useOrg } from "@/hooks/useOrg"
import { OPERATIONAL_QUERY_KEYS, DASHBOARD_QUERY_KEYS } from "@/lib/queries/portfolio"

interface MaintenanceActionsProps {
  readonly requestId: string
  readonly status: string
  readonly actualCostCents: number | null
}

export function MaintenanceActions({ requestId, status, actualCostCents }: MaintenanceActionsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { orgId } = useOrg()

  async function handleStatus(newStatus: string) {
    const result = await updateMaintenanceStatus(requestId, newStatus)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Status updated")
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: OPERATIONAL_QUERY_KEYS.maintenance(orgId) })
        queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.attentionItems(orgId) })
      }
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
        <SignOffCard requestId={requestId} actualCostCents={actualCostCents} />
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
