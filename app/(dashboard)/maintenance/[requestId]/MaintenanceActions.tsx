"use client"

/**
 * app/(dashboard)/maintenance/[requestId]/MaintenanceActions.tsx — action row for maintenance detail page
 *
 * Data:   calls updateMaintenanceStatus server action; status drives visibility
 * Notes:  Left cluster: status-specific ops + Add memo / Record delay / Change contractor.
 *         Right cluster: Last edited label + Cancel job. Terminal states hide all action buttons.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { ClipboardCheck, Clock, StickyNote } from "lucide-react"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { SignOffCard } from "@/components/maintenance/SignOffCard"
import { CancelDialog } from "@/components/maintenance/dialogs/CancelDialog"
import { ChangeContractorDialog } from "@/components/maintenance/dialogs/ChangeContractorDialog"
import { updateMaintenanceStatus } from "@/lib/actions/maintenance"
import { useOrg } from "@/hooks/useOrg"
import { OPERATIONAL_QUERY_KEYS, DASHBOARD_QUERY_KEYS } from "@/lib/queries/portfolio"
import { fmtZA } from "@/lib/dates"

interface Contractor { id: string; name: string }

interface MaintenanceActionsProps {
  readonly requestId: string
  readonly status: string
  readonly actualCostCents: number | null
  readonly contractorId: string | null
  readonly workOrderNumber: string | null
  readonly contractorName: string | null
  readonly loggedBy: string | null
  readonly contractors: Contractor[]
  readonly lastEditedAt: string | null
  readonly lastEditedBy: string | null
}

const TERMINAL = new Set(["completed", "closed", "cancelled", "rejected"])
const PRE_WO   = new Set(["pending_review", "pending_landlord", "approved"])

function formatEdited(iso: string) {
  return fmtZA(iso, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

export function MaintenanceActions({
  requestId, status, actualCostCents, contractorId,
  workOrderNumber, contractorName, loggedBy,
  contractors, lastEditedAt, lastEditedBy,
}: MaintenanceActionsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { orgId } = useOrg()
  const [cancelOpen, setCancelOpen] = useState(false)

  const isTerminal = TERMINAL.has(status)
  const isPreWO    = PRE_WO.has(status)
  const lastEditedLabel = lastEditedAt ? formatEdited(lastEditedAt) : null

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

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  if (isTerminal) {
    return lastEditedLabel ? (
      <p className="text-xs text-muted-foreground">
        Last edited {lastEditedLabel}{lastEditedBy ? ` · ${lastEditedBy}` : ""}
      </p>
    ) : null
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 w-full">

        {/* Left cluster — high-frequency ops */}
        <div className="flex flex-wrap items-center gap-2">
          {status === "in_progress" && (
            <ActionButton tone="primary" icon={<ClipboardCheck className="h-3.5 w-3.5" />} onClick={() => handleStatus("pending_completion")}>
              Request sign-off
            </ActionButton>
          )}
          {status === "pending_review" && (
            <>
              <ActionButton tone="primary" onClick={() => handleStatus("approved")}>Approve</ActionButton>
              <ActionButton tone="secondary" onClick={() => handleStatus("rejected")}>Reject</ActionButton>
            </>
          )}
          {status === "approved" && (
            <div title={!contractorId ? "Assign a contractor first" : undefined}>
              <ActionButton tone="primary" disabled={!contractorId} onClick={() => handleStatus("work_order_sent")}>
                Send Work Order
              </ActionButton>
            </div>
          )}
          {status === "pending_completion" && (
            <SignOffCard requestId={requestId} actualCostCents={actualCostCents} />
          )}
          {status === "completed" && (
            <ActionButton tone="secondary" onClick={() => handleStatus("closed")}>Close</ActionButton>
          )}

          <ActionButton tone="secondary" icon={<StickyNote className="h-3.5 w-3.5" />} onClick={() => scrollTo("notes-card")}>
            Add memo
          </ActionButton>
          <ActionButton tone="secondary" icon={<Clock className="h-3.5 w-3.5" />} onClick={() => scrollTo("delay-panel")}>
            Record delay
          </ActionButton>
          {!isPreWO && (
            <ChangeContractorDialog
              requestId={requestId}
              currentContractorId={contractorId}
              contractors={contractors}
            />
          )}
        </div>

        {/* Right cluster — metadata + destructive */}
        <div className="flex items-center gap-3 shrink-0">
          {lastEditedLabel && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Last edited</p>
              <p className="text-xs text-muted-foreground">
                {lastEditedLabel}{lastEditedBy ? ` · ${lastEditedBy}` : ""}
              </p>
            </div>
          )}
          <ActionButton tone="destructive" onClick={() => setCancelOpen(true)}>
            Cancel job
          </ActionButton>
        </div>
      </div>

      <CancelDialog
        requestId={requestId}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        status={status}
        workOrderNumber={workOrderNumber}
        contractorName={contractorName}
        loggedBy={loggedBy}
      />
    </>
  )
}
