"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { activateLease, giveNotice } from "@/lib/actions/leases"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, Download, Bell, RefreshCw, MoreHorizontal, Pencil, TrendingUp, FileText, ShieldCheck, Search } from "lucide-react"

interface LeaseActionsProps {
  readonly leaseId: string
  readonly status: string
}

export function LeaseActions({ leaseId, status }: LeaseActionsProps) {
  const router = useRouter()
  const isActive = status === "active" || status === "month_to_month"
  const isDraft  = status === "draft" || status === "pending_signing"

  async function handleActivate() {
    const result = await activateLease(leaseId)
    if (result?.error) toast.error(result.error)
    else { toast.success("Lease activated"); router.refresh() }
  }

  async function handleNotice(by: "tenant" | "landlord") {
    const result = await giveNotice(leaseId, by)
    if (result?.error) toast.error(result.error)
    else { toast.success("Notice recorded"); router.refresh() }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Primary action — status-dependent */}
      {isDraft && (
        <Button size="sm" onClick={handleActivate}>
          {status === "pending_signing" ? "Mark as Signed" : "Activate Lease"}
        </Button>
      )}

      {isActive && (
        <>
          <Button size="sm" variant="outline">
            <Download className="mr-1.5 h-4 w-4" /> Download
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleNotice("landlord")}>
            <Bell className="mr-1.5 h-4 w-4" /> Give notice
          </Button>
          <Button size="sm" variant="outline">
            <RefreshCw className="mr-1.5 h-4 w-4" /> Renew
          </Button>
        </>
      )}

      {/* More dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button size="sm" variant="outline">
            <MoreHorizontal className="mr-1 h-4 w-4" />
            More
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuItem render={<Link href={`/leases/${leaseId}/edit`} />}>
            <Pencil className="h-4 w-4" /> Edit lease
          </DropdownMenuItem>
          {isActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <TrendingUp className="h-4 w-4" /> Process escalation
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FileText className="h-4 w-4" /> Generate renewal offer
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ShieldCheck className="h-4 w-4" /> Send s14 notice
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href={`/leases/${leaseId}/deposit`} />}>
                <FileText className="h-4 w-4" /> View deposit
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Search className="h-4 w-4" /> View inspection history
              </DropdownMenuItem>
            </>
          )}
          {isActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleNotice("tenant")}>
                <Bell className="h-4 w-4" /> Tenant gave notice
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
