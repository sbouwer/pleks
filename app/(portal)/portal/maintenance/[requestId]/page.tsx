import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"

const URGENCY_LABEL: Record<string, string> = {
  emergency: "🚨 Emergency",
  urgent: "🟠 Urgent",
  routine: "🟡 Routine",
  cosmetic: "⚪ Cosmetic",
}

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

export default async function PortalMaintenanceDetailPage({
  params,
}: Readonly<{
  params: Promise<{ requestId: string }>
}>) {
  const { requestId } = await params
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()
  const { tenantId, orgId } = session

  const { data: req, error } = await service
    .from("maintenance_requests")
    .select(`
      id, title, description, category, urgency, status,
      work_order_number, created_at, completed_at,
      access_instructions, completion_notes,
      tenant_reported_urgency, ai_suggested_urgency,
      scheduled_date, contractor_id,
      contractor_view(first_name, last_name, company_name)
    `)
    .eq("id", requestId)
    .eq("tenant_id", tenantId)
    .eq("org_id", orgId)
    .single()

  if (error || !req) notFound()

  const contractor = req.contractor_view as unknown as {
    first_name: string | null; last_name: string | null; company_name: string | null
  } | null

  const contractorName = contractor?.company_name ||
    `${contractor?.first_name ?? ""} ${contractor?.last_name ?? ""}`.trim() ||
    null

  // Contractor updates (status changes from contractor)
  const { data: updates } = await service
    .from("contractor_updates")
    .select("id, new_status, notes, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-1">
          <Link href="/portal/maintenance" className="hover:text-foreground">Maintenance</Link> &rsaquo; Request
        </p>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-heading text-2xl">{req.title}</h1>
          <StatusBadge status={STATUS_MAP[req.status] ?? "pending"} />
        </div>
        {req.work_order_number && (
          <p className="text-sm text-muted-foreground mt-1">Ref: {req.work_order_number}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Details */}
        <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Issue description</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{req.description}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {req.category && (
              <Badge variant="secondary" className="capitalize">{req.category.replaceAll("_", " ")}</Badge>
            )}
            {req.urgency && (
              <Badge variant="outline">{URGENCY_LABEL[req.urgency] ?? req.urgency}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Logged {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Status + assignment */}
        <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Status</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current status</span>
              <span className="font-medium">{STATUS_LABEL[req.status] ?? req.status}</span>
            </div>
            {contractorName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned to</span>
                <span>{contractorName}</span>
              </div>
            )}
            {req.scheduled_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scheduled</span>
                <span>{new Date(req.scheduled_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            )}
            {req.completed_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span>{new Date(req.completed_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            )}
          </div>
          {req.completion_notes && (
            <div className="pt-2 border-t border-border/60">
              <p className="text-xs text-muted-foreground mb-1">Resolution</p>
              <p className="text-sm leading-relaxed">{req.completion_notes}</p>
            </div>
          )}
        </div>

      </div>

      {/* Timeline */}
      {(updates ?? []).length > 0 && (
        <div className="mt-4 rounded-xl border border-border/60 bg-card px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-4">Timeline</p>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="h-2 w-2 rounded-full bg-brand mt-1 shrink-0" />
                <div className="flex-1 w-px bg-border/60 mt-1" />
              </div>
              <div className="pb-4">
                <p className="text-sm font-medium">Reported</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
            {(updates ?? []).map((u, i) => (
              <div key={u.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-info mt-1 shrink-0" />
                  {i < (updates ?? []).length - 1 && <div className="flex-1 w-px bg-border/60 mt-1" />}
                </div>
                <div className="pb-4">
                  <p className="text-sm font-medium capitalize">
                    {u.new_status.replaceAll("_", " ")}
                  </p>
                  {u.notes && <p className="text-sm text-muted-foreground mt-0.5">{u.notes}</p>}
                  <p className="text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
