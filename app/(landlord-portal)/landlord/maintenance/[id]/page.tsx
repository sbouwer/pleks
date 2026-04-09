import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { LandlordMaintenanceCard } from "@/components/portal/LandlordMaintenanceCard"

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

export default async function LandlordMaintenanceDetailPage({ params }: Props) {
  const { id: requestId } = await params
  const session = await getLandlordSession()
  const service = await createServiceClient()

  // Fetch request — verify it belongs to a property owned by this landlord
  const { data: req } = await service
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

  if (!req) notFound()

  const unit = req.units as unknown as { unit_number: string; properties: { id: string; name: string; landlord_id: string | null } } | null
  if (!unit || unit.properties.landlord_id !== session.landlordId) notFound()

  const contractor = req.contractor_view as unknown as { first_name: string; last_name: string; company_name: string; phone: string; email: string } | null
  const contractorName = contractor ? (contractor.company_name || `${contractor.first_name ?? ""} ${contractor.last_name ?? ""}`.trim()) : null

  // Timeline entries from contractor_updates
  const { data: updates } = await service
    .from("contractor_updates")
    .select("new_status, notes, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <div>
        <Link href="/landlord/maintenance" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
          <ChevronLeft className="h-3.5 w-3.5" /> Maintenance
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-heading text-2xl">{req.title}</h1>
          {req.urgency && (() => {
            let urgencyClass: string
            if (req.urgency === "emergency") { urgencyClass = "text-danger" }
            else if (req.urgency === "urgent") { urgencyClass = "text-warning" }
            else { urgencyClass = "text-muted-foreground" }
            return (
              <span className={`text-xs font-bold shrink-0 mt-1 ${urgencyClass}`}>
                {URGENCY_LABEL[req.urgency]}
              </span>
            )
          })()}
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          {unit.unit_number}, {unit.properties.name}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Status: {STATUS_DISPLAY[req.status] ?? req.status.replace(/_/g, " ")}
        </p>
      </div>

      {/* Approval card */}
      {req.status === "pending_landlord" && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Your approval is needed</p>
          <LandlordMaintenanceCard req={req} showApproveActions />
        </div>
      )}

      {/* Details */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Details</p>
        {req.description && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Description</p>
            <p className="leading-relaxed whitespace-pre-wrap">{req.description}</p>
          </div>
        )}
        {req.category && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Category</p>
            <p className="capitalize">{req.category.replace(/_/g, " ")}</p>
          </div>
        )}
        {req.ai_triage_notes && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">AI assessment</p>
            <p className="text-muted-foreground">{req.ai_triage_notes}</p>
          </div>
        )}
        {req.access_instructions && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Access</p>
            <p>{req.access_instructions}</p>
          </div>
        )}
      </div>

      {/* Contractor & cost */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Contractor & cost</p>
        {contractorName ? (
          <div>
            <p className="font-medium">{contractorName}</p>
            {contractor?.phone && <p className="text-muted-foreground">{contractor.phone}</p>}
          </div>
        ) : (
          <p className="text-muted-foreground">No contractor assigned yet</p>
        )}
        {req.estimated_cost_cents && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estimated</span>
            <span>{formatZAR(req.estimated_cost_cents)}</span>
          </div>
        )}
        {req.quoted_cost_cents && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quoted</span>
            <span>{formatZAR(req.quoted_cost_cents)}</span>
          </div>
        )}
        {req.actual_cost_cents && (
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Final cost</span>
            <span>{formatZAR(req.actual_cost_cents)}</span>
          </div>
        )}
      </div>

      {/* Completion notes */}
      {req.completion_notes && (
        <div className="rounded-xl border border-success/20 bg-success/5 px-5 py-4 space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Completion report</p>
          <p className="leading-relaxed">{req.completion_notes}</p>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Timeline</p>
        <div className="space-y-2.5">
          <div className="flex items-center gap-3 text-sm">
            <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
            <span>Logged — {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          {(updates ?? []).map((u, i) => (
            <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-info shrink-0" />
              <span className="capitalize">{u.new_status.replace(/_/g, " ")}{u.notes ? ` — ${u.notes}` : ""}</span>
              <span className="text-xs ml-auto">{new Date(u.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
            </div>
          ))}
          {req.completed_at && (
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-success shrink-0" />
              <span>Completed — {new Date(req.completed_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
