"use client"

import { Button } from "@/components/ui/button"
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
          <Button size="sm" onClick={() => handleStatus("payment_arrangement")}>Record Arrangement</Button>
          <Button size="sm" variant="outline" onClick={() => handleStatus("legal")}>Refer to Attorney</Button>
          <Button size="sm" variant="outline" onClick={() => handleStatus("resolved")}>Mark Resolved</Button>
        </>
      )}
      {status === "payment_arrangement" && (
        <>
          <Button size="sm" onClick={() => handleStatus("resolved")}>Mark Resolved</Button>
          <Button size="sm" variant="outline" onClick={() => handleStatus("open")}>Resume Sequence</Button>
        </>
      )}
      {status === "legal" && (
        <>
          <Button size="sm" onClick={() => handleStatus("resolved")}>Mark Resolved</Button>
          <Button size="sm" variant="outline" onClick={() => handleStatus("written_off")}>Write Off</Button>
        </>
      )}
    </div>
  )
}
