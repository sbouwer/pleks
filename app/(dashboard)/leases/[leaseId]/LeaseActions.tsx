"use client"

/**
 * app/(dashboard)/leases/[leaseId]/LeaseActions.tsx — Action bar for the lease detail header (status-dependent)
 *
 * Route:  /leases/[leaseId]
 * Auth:   gateway (dashboard layout)
 * Data:   markAsSigned / giveNotice server actions; invalidates react-query lease/property/dashboard caches
 */
import Link from "next/link"
import { ActionButton } from "@/components/ui/actions"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { markAsSigned, giveNotice } from "@/lib/actions/leases"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ChevronDown, Download, Bell, RefreshCw, MoreHorizontal, Pencil, TrendingUp, FileText, ShieldCheck, Search, Clock } from "lucide-react"
import { useOrg } from "@/hooks/useOrg"
import { PORTFOLIO_QUERY_KEYS, DASHBOARD_QUERY_KEYS } from "@/lib/queries/portfolio"

interface LeaseActionsProps {
  readonly leaseId: string
  readonly status: string
  readonly unitId?: string | null
}

export function LeaseActions({ leaseId, status, unitId }: LeaseActionsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { orgId } = useOrg()
  const isActive = status === "active" || status === "month_to_month"
  const isPendingSigning = status === "pending_signing"

  async function handleMarkSigned() {
    const result = await markAsSigned(leaseId)
    if (result?.error) toast.error(result.error)
    else {
      toast.success("Lease activated")
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId) })
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.properties(orgId) })
        queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.metrics(orgId) })
      }
      router.refresh()
    }
  }

  async function handleNotice(by: "tenant" | "landlord") {
    const result = await giveNotice(leaseId, by)
    if (result?.error) toast.error(result.error)
    else {
      toast.success("Notice recorded")
      if (orgId) {
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.leases(orgId) })
      }
      router.refresh()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Primary action — status-dependent */}
      {isPendingSigning && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-3.5" /> Awaiting signatures
          </span>
          <ActionButton tone="secondary" onClick={handleMarkSigned}>
            Mark as signed
          </ActionButton>
        </div>
      )}

      {isActive && (
        <>
          <ActionButton tone="secondary" icon={<Download className="h-4 w-4" />}>
            Download
          </ActionButton>
          <ActionButton tone="secondary" icon={<Bell className="h-4 w-4" />} onClick={() => handleNotice("landlord")}>
            Give notice
          </ActionButton>
          <ActionButton tone="secondary" icon={<RefreshCw className="h-4 w-4" />}>
            Renew
          </ActionButton>
        </>
      )}

      {/* More dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="pa-secondary">
          <span><MoreHorizontal className="mr-1 h-4 w-4" /> More <ChevronDown className="ml-1 h-3 w-3" /></span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-56">
          <DropdownMenuItem render={<Link href={`/leases/${leaseId}/edit`} />}>
            <Pencil className="h-4 w-4" /> Edit lease
          </DropdownMenuItem>
          {isActive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <TrendingUp className="h-4 w-4" /> Process escalation
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Soon</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <FileText className="h-4 w-4" /> Generate renewal offer
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Soon</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <ShieldCheck className="h-4 w-4" /> Send s14 notice
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">Soon</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href={`/leases/${leaseId}/deposit`} />}>
                <FileText className="h-4 w-4" /> View deposit
              </DropdownMenuItem>
              <DropdownMenuItem render={unitId ? <Link href={`/inspections?unit=${unitId}`} /> : undefined} onClick={!unitId ? () => toast.info("No unit linked to this lease") : undefined}>
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
