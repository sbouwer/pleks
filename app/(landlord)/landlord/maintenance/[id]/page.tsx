/**
 * app/(landlord)/landlord/maintenance/[id]/page.tsx — landlord portal: one maintenance request detail
 *
 * Route:  /landlord/maintenance/[id]
 * Auth:   getLandlordSession (token-gated); verifies the property's landlord_id matches
 * Data:   maintenance_requests (+ unit/property, contractor_view, contractor_updates) via the service client
 * Notes:  Canon DetailPageLayout + DetailCard (door style). Approval card shown when status = pending_landlord.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { notFound } from "next/navigation"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailCard } from "@/components/detail/DetailCard"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { formatZAR } from "@/lib/constants"
import { LandlordMaintenanceCard } from "@/components/portal/LandlordMaintenanceCard"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateZA, fmtZA } from "@/lib/dates"

interface Props {
  params: Promise<{ id: string }>
}

const URGENCY_LABEL: Record<string, string> = {
  emergency: "🚨 Emergency", urgent: "🟠 Urgent", routine: "🟡 Routine", cosmetic: "⚪ Cosmetic",
}

const STATUS_DISPLAY: Record<string, string> = {
  pending_review: "Under review",
  approved: "Approved — awaiting work order",
  pending_landlord: "Awaiting your approval",
  landlord_approved: "You approved this",
  landlord_rejected: "You rejected this",
  rejected: "Rejected by agent",
  work_order_sent: "Work order sent",
  acknowledged: "Contractor acknowledged",
  in_progress: "Contractor on-site",
  pending_completion: "Awaiting agent sign-off",
  completed: "Completed",
  closed: "Closed",
}

function mStatus(s: string): DetailStatus {
  const label = STATUS_DISPLAY[s] ?? s.replace(/_/g, " ")
  if (["completed", "closed"].includes(s)) return { kind: "occupied", label }
  if (["rejected", "landlord_rejected"].includes(s)) return { kind: "flag", label }
  if (s === "pending_landlord") return { kind: "vacant", label }
  return { kind: "neutral", label }
}

export default async function LandlordMaintenanceDetailPage({ params }: Props) {
  const { id: requestId } = await params
  const session = await getLandlordSession()
  const service = await createServiceClient()

  // Fetch request — verify it belongs to a property owned by this landlord
  const { data: req, error: reqError } = await service
    .from("maintenance_requests")
    .select(`
      id, title, description, category, urgency, status, created_at, completed_at,
      access_instructions, ai_triage_notes, rejection_reason, completion_notes,
      estimated_cost_cents, quoted_cost_cents, actual_cost_cents,
      landlord_approval_token, landlord_approval_token,
      units(unit_number, properties(id, name, landlord_id)),
      contractor_view(first_name, last_name, company_name, phone, email)
    `)
    .eq("id", requestId)
    .single()
    logQueryError("LandlordMaintenanceDetailPage maintenance_requests", reqError)

  if (!req) notFound()

  const unit = req.units as unknown as { unit_number: string; properties: { id: string; name: string; landlord_id: string | null } } | null
  if (!unit || unit.properties.landlord_id !== session.landlordId) notFound()

  const contractor = req.contractor_view as unknown as { first_name: string; last_name: string; company_name: string; phone: string; email: string } | null
  const contractorName = contractor ? (contractor.company_name || `${contractor.first_name ?? ""} ${contractor.last_name ?? ""}`.trim()) : null

  // Timeline entries from contractor_updates
  const { data: updates, error: updatesError } = await service
    .from("contractor_updates")
    .select("new_status, notes, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    logQueryError("LandlordMaintenanceDetailPage contractor_updates", updatesError)

  const facts: DetailFact[] = [{ k: "Property", v: `${unit.unit_number}, ${unit.properties.name}` }]
  if (req.urgency) facts.push({ k: "Urgency", v: URGENCY_LABEL[req.urgency] ?? req.urgency })
  if (req.category) facts.push({ k: "Category", v: req.category.replace(/_/g, " ") })

  return (
    <DetailPageLayout
      category="Maintenance"
      backHref="/landlord/maintenance"
      title={req.title}
      status={mStatus(req.status)}
      facts={facts}
    >
      {/* Approval card */}
      {req.status === "pending_landlord" && (
        <DetailFullWidth>
          <DetailCard title="Your approval is needed">
            <LandlordMaintenanceCard req={req} showApproveActions />
          </DetailCard>
        </DetailFullWidth>
      )}

      {/* Details */}
      <DetailCard title="Details">
        <div className="space-y-4 text-sm">
          {req.description && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Description</p>
              <p className="whitespace-pre-wrap leading-relaxed text-foreground">{req.description}</p>
            </div>
          )}
          {req.category && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Category</p>
              <p className="capitalize text-foreground">{req.category.replace(/_/g, " ")}</p>
            </div>
          )}
          {req.ai_triage_notes && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">AI assessment</p>
              <p className="text-muted-foreground">{req.ai_triage_notes}</p>
            </div>
          )}
          {req.access_instructions && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Access</p>
              <p className="text-foreground">{req.access_instructions}</p>
            </div>
          )}
        </div>
      </DetailCard>

      {/* Contractor & cost */}
      <DetailCard title="Contractor & cost">
        <div className="space-y-3 text-sm">
          {contractorName ? (
            <div>
              <p className="font-medium text-foreground">{contractorName}</p>
              {contractor?.phone && <p className="text-muted-foreground">{contractor.phone}</p>}
            </div>
          ) : (
            <p className="text-muted-foreground">No contractor assigned yet</p>
          )}
          {req.estimated_cost_cents && (
            <div className="flex justify-between"><span className="text-muted-foreground">Estimated</span><span className="text-foreground">{formatZAR(req.estimated_cost_cents)}</span></div>
          )}
          {req.quoted_cost_cents && (
            <div className="flex justify-between"><span className="text-muted-foreground">Quoted</span><span className="text-foreground">{formatZAR(req.quoted_cost_cents)}</span></div>
          )}
          {req.actual_cost_cents && (
            <div className="flex justify-between font-medium"><span className="text-muted-foreground">Final cost</span><span className="text-foreground">{formatZAR(req.actual_cost_cents)}</span></div>
          )}
        </div>
      </DetailCard>

      {/* Completion notes */}
      {req.completion_notes && (
        <DetailFullWidth>
          <DetailCard title="Completion report">
            <p className="text-sm leading-relaxed text-foreground">{req.completion_notes}</p>
          </DetailCard>
        </DetailFullWidth>
      )}

      {/* Timeline */}
      <DetailFullWidth>
        <DetailCard title="Timeline">
          <div className="space-y-2.5">
            <div className="flex items-center gap-3 text-sm">
              <div className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              <span className="text-foreground">Logged — {fmtDateZA(req.created_at)}</span>
            </div>
            {(updates ?? []).map((u, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
                <span className="capitalize">{u.new_status.replace(/_/g, " ")}{u.notes ? ` — ${u.notes}` : ""}</span>
                <span className="ml-auto text-xs">{fmtZA(u.created_at, { day: "numeric", month: "short" })}</span>
              </div>
            ))}
            {req.completed_at && (
              <div className="flex items-center gap-3 text-sm">
                <div className="h-2 w-2 shrink-0 rounded-full bg-success" />
                <span className="text-foreground">Completed — {fmtDateZA(req.completed_at)}</span>
              </div>
            )}
          </div>
        </DetailCard>
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
