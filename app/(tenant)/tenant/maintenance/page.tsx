/**
 * app/(tenant)/tenant/maintenance/page.tsx — tenant portal: maintenance request list
 *
 * Route:  /tenant/maintenance
 * Auth:   getTenantSession (redirects to /login); scoped to the tenant + org
 * Data:   maintenance_requests (latest 50) via the service client
 * Notes:  Canon ResourcePageHeader + ListCard rows / EmptyResourceState (door style) — presentation only.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ListCard } from "@/components/ui/resource-list"
import { ActionButton } from "@/components/ui/actions"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Wrench, Plus } from "lucide-react"

const STATUS_MAP: Record<string, "pending" | "active" | "completed" | "arrears"> = {
  pending_review: "pending",
  approved: "active",
  work_order_sent: "active",
  acknowledged: "active",
  in_progress: "active",
  pending_completion: "active",
  completed: "completed",
  closed: "completed",
  rejected: "arrears",
  cancelled: "arrears",
}

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  work_order_sent: "Work order sent",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  pending_completion: "Awaiting sign-off",
  completed: "Completed",
  closed: "Closed",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

export default async function PortalMaintenancePage() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()
  const { tenantId, orgId } = session

  const { data: requests, error } = await service
    .from("maintenance_requests")
    .select("id, title, category, status, urgency, created_at, work_order_number")
    .eq("tenant_id", tenantId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) console.error("fetchMaintenancePortal failed:", error.message)
  const list = requests ?? []

  const reportBtn = (
    <ActionButton asChild tone="primary" size="sm">
      <Link href="/tenant/maintenance/new"><Plus className="mr-1.5 h-4 w-4" />Report issue</Link>
    </ActionButton>
  )

  if (list.length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Tenant"
        title="Maintenance"
        headline="No requests yet"
        headerSub="Report a maintenance issue and your agent will be notified."
        emptyTitle="No maintenance requests"
        emptySub="Use the button below to report a maintenance issue. Your agent will be notified."
        icon={<Wrench className="h-6 w-6" />}
        headerAction={reportBtn}
        heroAction={reportBtn}
      />
    )
  }

  return (
    <div>
      <ResourcePageHeader
        eyebrow="Tenant"
        title="Maintenance"
        headline={`${list.length} request${list.length === 1 ? "" : "s"}`}
        action={reportBtn}
      />
      <ListCard>
        <div className="divide-y divide-border">
          {list.map((req) => (
            <Link
              key={req.id}
              href={`/tenant/maintenance/${req.id}`}
              className="flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{req.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {req.category && <span className="capitalize">{req.category.replaceAll("_", " ")} · </span>}
                  {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                  {req.work_order_number && ` · ${req.work_order_number}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={STATUS_MAP[req.status] ?? "pending"} />
                <p className="text-xs text-muted-foreground">{STATUS_LABEL[req.status] ?? req.status}</p>
              </div>
            </Link>
          ))}
        </div>
      </ListCard>
    </div>
  )
}
