import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Maintenance</h1>
          <p className="text-sm text-muted-foreground">{list.length} request{list.length === 1 ? "" : "s"}</p>
        </div>
        <Button render={<Link href="/portal/maintenance/new" />}>
          <Plus className="h-4 w-4 mr-1.5" />
          Report issue
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-8 w-8 text-muted-foreground" />}
          title="No maintenance requests"
          description="Use the button above to report a maintenance issue. Your agent will be notified."
        />
      ) : (
        <div className="space-y-2">
          {list.map((req) => (
            <Link key={req.id} href={`/portal/maintenance/${req.id}`}>
              <div className="rounded-xl border border-border/60 bg-card px-5 py-4 hover:border-brand/40 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{req.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {req.category && <span className="capitalize">{req.category.replaceAll("_", " ")} · </span>}
                      {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                      {req.work_order_number && ` · ${req.work_order_number}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={STATUS_MAP[req.status] ?? "pending"} />
                    <p className="text-xs text-muted-foreground">{STATUS_LABEL[req.status] ?? req.status}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
