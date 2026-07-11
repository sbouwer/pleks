/**
 * app/(landlord)/landlord/maintenance/page.tsx — landlord portal: maintenance across the landlord's properties
 *
 * Route:  /landlord/maintenance
 * Auth:   getLandlordSession (token-gated); scoped to the landlord's properties
 * Data:   createServiceClient — properties → maintenance_requests (+ unit/property, contractor_view)
 * Notes:  Canon ResourcePageHeader + DetailCard sections / EmptyResourceState (door style) — presentation only.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"
import Link from "next/link"
import { Wrench } from "lucide-react"
import { LandlordMaintenanceCard } from "@/components/portal/LandlordMaintenanceCard"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { DetailCard } from "@/components/detail/DetailCard"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function LandlordMaintenancePage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  const { data: properties, error: propertiesError } = await service
    .from("properties")
    .select("id")
    .eq("landlord_id", session.landlordId)
    .is("deleted_at", null)
    logQueryError("LandlordMaintenancePage properties", propertiesError)

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

  if (all.length === 0) {
    return (
      <EmptyResourceState
        eyebrow="Landlord"
        title="Maintenance"
        headline="Nothing to action"
        headerSub="Maintenance across your properties appears here."
        emptyTitle="No maintenance requests"
        emptySub="There are no maintenance requests for your properties right now."
        icon={<Wrench className="h-6 w-6" />}
      />
    )
  }

  return (
    <div className="space-y-4">
      <ResourcePageHeader
        eyebrow="Landlord"
        title="Maintenance"
        headline={`${all.length} request${all.length === 1 ? "" : "s"} across your properties`}
      />

      {/* Needs approval */}
      {pendingApproval.length > 0 && (
        <DetailCard title={`Needs your approval (${pendingApproval.length})`}>
          <div className="space-y-4">
            {pendingApproval.map((req) => {
              const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
              return (
                <div key={req.id} className="space-y-1">
                  {unit && <p className="pl-5 text-xs text-muted-foreground">{formatPropertyLabel(unit)}</p>}
                  <LandlordMaintenanceCard req={req} showApproveActions />
                </div>
              )
            })}
          </div>
        </DetailCard>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <DetailCard title={`In progress (${inProgress.length})`}>
          <div className="space-y-1">
            {inProgress.map((req) => {
              const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
              return (
                <Link key={req.id} href={`/landlord/maintenance/${req.id}`} className="group flex items-center gap-3 py-1.5">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${URGENCY_DOT[req.urgency ?? "routine"]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{req.title}</p>
                    {unit && <p className="text-xs text-muted-foreground">{formatPropertyLabel(unit)}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{STATUS_DISPLAY[req.status] ?? req.status.replaceAll("_", " ")}</span>
                </Link>
              )
            })}
          </div>
        </DetailCard>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <DetailCard title="Completed (last 30 days)">
          <div className="space-y-1">
            {completed.map((req) => {
              const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
              return (
                <div key={req.id} className="flex items-center gap-3 py-1.5 text-sm text-muted-foreground">
                  <span className="shrink-0 text-success">✅</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{req.title}</p>
                    {unit && <p className="text-xs">{formatPropertyLabel(unit)}</p>}
                  </div>
                  {req.actual_cost_cents && <span className="shrink-0">{formatZAR(req.actual_cost_cents)}</span>}
                </div>
              )
            })}
          </div>
        </DetailCard>
      )}
    </div>
  )
}
