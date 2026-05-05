"use client"

/**
 * app/(dashboard)/billing/arrears/[caseId]/ArrearsActions.tsx — Status-transition action buttons for an arrears case.
 *
 * Route:  /billing/arrears/[caseId]
 * Auth:   requireAdminAuth
 * Data:   status prop from parent server component; mutations via updateArrearsStatus server action
 * Notes:  Renders nothing once the case reaches a terminal state (resolved / written_off)
 */

import { ActionButton } from "@/components/ui/actions"
import { updateArrearsStatus } from "@/lib/actions/arrears"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface ArrearsActionsProps {
  readonly caseId: string
  readonly status: string
}

export function ArrearsActions({ caseId, status }: ArrearsActionsProps) {
  const router = useRouter()

  async function handleStatus(newStatus: string) {
    const result = await updateArrearsStatus(caseId, newStatus)
    if (result?.error) toast.error(result.error)
    else { toast.success("Updated"); router.refresh() }
  }

  if (status === "resolved" || status === "written_off") return null

  return (
    <div className="flex flex-wrap gap-2">
      {status === "open" && (
        <>
          <ActionButton tone="primary" onClick={() => handleStatus("payment_arrangement")}>Record Arrangement</ActionButton>
          <ActionButton tone="secondary" onClick={() => handleStatus("legal")}>Refer to Attorney</ActionButton>
          <ActionButton tone="secondary" onClick={() => handleStatus("resolved")}>Mark Resolved</ActionButton>
        </>
      )}
      {status === "payment_arrangement" && (
        <>
          <ActionButton tone="primary" onClick={() => handleStatus("resolved")}>Mark Resolved</ActionButton>
          <ActionButton tone="secondary" onClick={() => handleStatus("open")}>Resume Sequence</ActionButton>
        </>
      )}
      {status === "legal" && (
        <>
          <ActionButton tone="primary" onClick={() => handleStatus("resolved")}>Mark Resolved</ActionButton>
          <ActionButton tone="destructive" onClick={() => handleStatus("written_off")}>Write Off</ActionButton>
        </>
      )}
    </div>
  )
}
