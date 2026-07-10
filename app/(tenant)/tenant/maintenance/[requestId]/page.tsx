/**
 * app/(tenant)/tenant/maintenance/[requestId]/page.tsx — tenant portal: one maintenance request detail
 *
 * Route:  /tenant/maintenance/[requestId]
 * Auth:   getTenantSession (redirects to /login); the request is scoped to the tenant + org
 * Data:   maintenance_requests (+ contractor_view, contractor_updates) via the service client
 * Notes:  Read-only detail. Canon DetailPageLayout + DetailCard (door style) — presentation only.
 */
import { redirect, notFound } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateLongZA } from "@/lib/dates"

const URGENCY_LABEL: Record<string, string> = {
  emergency: "🚨 Emergency",
  urgent: "🟠 Urgent",
  routine: "🟡 Routine",
  cosmetic: "⚪ Cosmetic",
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

/** Maintenance lifecycle → header status pill: green when resolved, red when refused, amber while live. */
function detailStatus(status: string): DetailStatus {
  const label = STATUS_LABEL[status] ?? status
  if (status === "completed" || status === "closed") return { kind: "occupied", label }
  if (status === "rejected" || status === "cancelled") return { kind: "flag", label }
  if (status === "pending_review") return { kind: "neutral", label }
  return { kind: "vacant", label }
}

function fmtDate(d: string): string {
  return fmtDateLongZA(d)
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  )
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
  const { data: updates, error: updatesError } = await service
    .from("contractor_updates")
    .select("id, new_status, notes, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    logQueryError("PortalMaintenanceDetailPage contractor_updates", updatesError)

  const facts: DetailFact[] = []
  if (req.work_order_number) facts.push({ k: "Ref", v: req.work_order_number, mono: true })
  if (req.category) facts.push({ k: "Category", v: req.category.replaceAll("_", " ") })
  if (req.urgency) facts.push({ k: "Urgency", v: URGENCY_LABEL[req.urgency] ?? req.urgency })
  facts.push({ k: "Logged", v: fmtDate(req.created_at) })

  return (
    <DetailPageLayout
      category="Maintenance"
      backHref="/tenant/maintenance"
      title={req.title}
      status={detailStatus(req.status)}
      facts={facts}
    >
      <DetailCard title="Issue description">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{req.description}</p>
      </DetailCard>

      <DetailCard title="Status">
        <div className="space-y-2 text-sm">
          <Row label="Current status" value={STATUS_LABEL[req.status] ?? req.status} />
          {contractorName && <Row label="Assigned to" value={contractorName} />}
          {req.scheduled_date && <Row label="Scheduled" value={fmtDate(req.scheduled_date)} />}
          {req.completed_at && <Row label="Completed" value={fmtDate(req.completed_at)} />}
        </div>
        {req.completion_notes && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1 text-xs text-muted-foreground">Resolution</p>
            <p className="text-sm leading-relaxed text-foreground">{req.completion_notes}</p>
          </div>
        )}
      </DetailCard>

      {(updates ?? []).length > 0 && (
        <DetailFullWidth>
          <DetailCard title="Timeline">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <div className="mt-1 w-px flex-1 bg-border" />
                </div>
                <div className="pb-4">
                  <p className="text-sm font-medium text-foreground">Reported</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
              {(updates ?? []).map((u, i) => (
                <div key={u.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                    {i < (updates ?? []).length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium capitalize text-foreground">
                      {u.new_status.replaceAll("_", " ")}
                    </p>
                    {u.notes && <p className="mt-0.5 text-sm text-muted-foreground">{u.notes}</p>}
                    <p className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </DetailCard>
        </DetailFullWidth>
      )}
    </DetailPageLayout>
  )
}
