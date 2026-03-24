"use client"

import { Button } from "@/components/ui/button"
import { activateLease, giveNotice } from "@/lib/actions/leases"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface LeaseActionsProps {
  readonly leaseId: string
  readonly status: string
}

export function LeaseActions({ leaseId, status }: LeaseActionsProps) {
  const router = useRouter()

  async function handleActivate() {
    const result = await activateLease(leaseId)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Lease activated")
      router.refresh()
    }
  }

  async function handleNotice(by: "tenant" | "landlord") {
    const result = await giveNotice(leaseId, by)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Notice recorded")
      router.refresh()
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <Button size="sm" onClick={handleActivate}>
          Activate Lease
        </Button>
      )}
      {status === "pending_signing" && (
        <Button size="sm" onClick={handleActivate}>
          Mark as Signed
        </Button>
      )}
      {(status === "active" || status === "month_to_month") && (
        <>
          <Button size="sm" variant="outline" onClick={() => handleNotice("tenant")}>
            Tenant Gave Notice
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleNotice("landlord")}>
            Give Notice
          </Button>
        </>
      )}
    </div>
  )
}
