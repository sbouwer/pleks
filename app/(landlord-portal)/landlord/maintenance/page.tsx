import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import Link from "next/link"
import { LandlordMaintenanceCard } from "@/components/portal/LandlordMaintenanceCard"
import { formatZAR } from "@/lib/constants"

export default async function LandlordMaintenancePage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  const { data: properties } = await service
    .from("properties")
    .select("id")
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)

  const propertyIds = (properties ?? []).map((p) => p.id)

  const { data: requests } = propertyIds.length > 0
    ? await service
        .from("maintenance_requests")
        .select("id, title, urgency, status, estimated_cost_cents, quoted_cost_cents, actual_cost_cents, created_at, completed_at, landlord_approval_token, units(unit_number, properties(name)), contractor_view(company_name, first_name, last_name)")
        .in("property_id", propertyIds)
        .not("status", "in", "(cancelled)")
        .order("created_at", { ascending: false })
    : { data: [] }

  const all = requests ?? []

  const pendingApproval = all.filter((r) => r.status === "pending_landlord")
  const inProgress = all.filter((r) => ["approved", "work_order_sent", "acknowledged", "in_progress", "pending_completion", "pending_review"].includes(r.status))
  // eslint-disable-next-line react-hooks/purity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const completed = all
    .filter((r) => ["completed", "closed", "tenant_notified"].includes(r.status))
    .filter((r) => !r.completed_at || r.completed_at >= thirtyDaysAgo)
    .slice(0, 20)

  const URGENCY_DOT: Record<string, string> = {
    emergency: "bg-danger", urgent: "bg-warning", routine: "bg-info", cosmetic: "bg-muted-foreground/40",
  }

  const STATUS_DISPLAY: Record<string, string> = {
    pending_review: "Under review", approved: "Approved", work_order_sent: "Work order sent",
    acknowledged: "Acknowledged", in_progress: "In progress", pending_completion: "Awaiting sign-off",
    pending_landlord: "Awaiting your approval",
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-heading text-3xl">Maintenance</h1>

      {/* Needs approval */}
      {pendingApproval.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Needs your approval ({pendingApproval.length})
          </p>
          {pendingApproval.map((req) => {
            const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
            return (
              <div key={req.id} className="space-y-1">
                {unit && <p className="text-xs text-muted-foreground pl-5">{unit.unit_number}, {unit.properties.name}</p>}
                <LandlordMaintenanceCard req={req} showApproveActions />
              </div>
            )
          })}
        </div>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
            In progress ({inProgress.length})
          </p>
          {inProgress.map((req) => {
            const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
            return (
              <Link key={req.id} href={`/landlord/maintenance/${req.id}`} className="flex items-center gap-3 py-1.5 group">
                <div className={`h-2 w-2 rounded-full shrink-0 ${URGENCY_DOT[req.urgency ?? "routine"]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{req.title}</p>
                  {unit && <p className="text-xs text-muted-foreground">{unit.unit_number}, {unit.properties.name}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{STATUS_DISPLAY[req.status] ?? req.status.replaceAll("_", " ")}</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
            Completed (last 30 days)
          </p>
          {completed.map((req) => {
            const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
            return (
              <div key={req.id} className="flex items-center gap-3 py-1.5 text-sm text-muted-foreground">
                <span className="text-success shrink-0">✅</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{req.title}</p>
                  {unit && <p className="text-xs">{unit.unit_number}, {unit.properties.name}</p>}
                </div>
                {req.actual_cost_cents && <span className="shrink-0">{formatZAR(req.actual_cost_cents)}</span>}
              </div>
            )
          })}
        </div>
      )}

      {all.length === 0 && (
        <p className="text-sm text-muted-foreground">No maintenance requests for your properties.</p>
      )}
    </div>
  )
}
