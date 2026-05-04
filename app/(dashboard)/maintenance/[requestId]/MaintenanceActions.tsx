"use client"

/**
 * app/(dashboard)/maintenance/[requestId]/MaintenanceActions.tsx — status action buttons for a maintenance request
 *
 * Data:   calls updateMaintenanceStatus server action
 * Notes:  "Send Work Order" is disabled and shows a tooltip when no contractor is assigned.
 *         The action returns a custom toast message for work_order_sent.
 */
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
  readonly contractorId: string | null
}

export function MaintenanceActions({ requestId, status, actualCostCents, contractorId }: MaintenanceActionsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { orgId } = useOrg()

  async function handleStatus(newStatus: string) {
    const result = await updateMaintenanceStatus(requestId, newStatus)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(result.toast ?? "Status updated")
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: OPERATIONAL_QUERY_KEYS.maintenance(orgId) })
        queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.attentionItems(orgId) })
      }
      router.refresh()
    }
  }

  const noContractor = !contractorId

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending_review" && (
        <>
          <Button size="sm" onClick={() => handleStatus("approved")}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => handleStatus("rejected")}>Reject</Button>
        </>
      )}
      {status === "approved" && (
        <div title={noContractor ? "Assign a contractor in the Cost & Contractor section first" : undefined}>
          <Button
            size="sm"
            disabled={noContractor}
            onClick={() => handleStatus("work_order_sent")}
          >
            Send Work Order
          </Button>
          {noContractor && (
            <p className="text-xs text-muted-foreground mt-1">No contractor assigned</p>
          )}
        </div>
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
