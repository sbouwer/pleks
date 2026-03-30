import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"
import { MaintenanceActions } from "./MaintenanceActions"

const URGENCY_COLORS: Record<string, string> = {
  emergency: "text-danger",
  urgent: "text-warning",
  routine: "text-foreground",
  cosmetic: "text-muted-foreground",
}

const STATUS_MAP: Record<string, "pending" | "active" | "completed" | "arrears" | "scheduled"> = {
  pending_review: "pending",
  approved: "scheduled",
  work_order_sent: "scheduled",
  acknowledged: "scheduled",
  in_progress: "active",
  pending_completion: "pending",
  completed: "completed",
  closed: "completed",
  rejected: "arrears",
  cancelled: "arrears",
}

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("*, units(unit_number, properties(name, address_line1)), tenant_view(first_name, last_name, phone), contractor_view(first_name, last_name, company_name, email, phone)")
    .eq("id", requestId)
    .single()

  if (!request) notFound()

  const unit = request.units as unknown as { unit_number: string; properties: { name: string; address_line1: string } } | null
  const tenant = request.tenant_view as unknown as { first_name: string; last_name: string; phone: string } | null
  const contractor = request.contractor_view as unknown as { first_name: string; last_name: string; company_name: string; email: string; phone: string } | null

  // Get contractor updates timeline
  const { data: updates } = await supabase
    .from("contractor_updates")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/maintenance" className="hover:text-foreground">Maintenance</Link> &rsaquo; {request.work_order_number || request.title}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl">{request.title}</h1>
            <StatusBadge status={STATUS_MAP[request.status] || "pending"} />
          </div>
          <p className="text-muted-foreground">
            {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
            {request.category && ` · ${request.category}`}
          </p>
        </div>
        <MaintenanceActions requestId={requestId} status={request.status} />
      </div>

      {/* Urgency + AI triage */}
      {request.urgency && (
        <Card className={`mb-4 ${request.urgency === "emergency" ? "border-danger/30 bg-danger-bg" : ""}`}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-medium uppercase ${URGENCY_COLORS[request.urgency]}`}>
                {request.urgency}
              </span>
              {request.ai_triage_notes && (
                <span className="text-xs text-muted-foreground">· AI triage</span>
              )}
            </div>
            {request.ai_triage_notes && (
              <p className="text-sm text-muted-foreground">{request.ai_triage_notes}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Description</p>
              <p className="whitespace-pre-wrap">{request.description}</p>
            </div>
            {request.access_instructions && (
              <div>
                <p className="text-muted-foreground mb-1">Access Instructions</p>
                <p>{request.access_instructions}</p>
              </div>
            )}
            {request.special_instructions && (
              <div>
                <p className="text-muted-foreground mb-1">Special Instructions</p>
                <p>{request.special_instructions}</p>
              </div>
            )}
            {tenant && (
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground mb-1">Tenant</p>
                <p>{tenant.first_name} {tenant.last_name} · {tenant.phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Cost & Contractor</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {contractor && (
              <div>
                <p className="text-muted-foreground mb-1">Contractor</p>
                <p className="font-medium">{contractor.company_name || `${contractor.first_name} ${contractor.last_name}`.trim()}</p>
                <p className="text-muted-foreground">{contractor.email} · {contractor.phone}</p>
              </div>
            )}
            {request.estimated_cost_cents && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated</span>
                <span>{formatZAR(request.estimated_cost_cents)}</span>
              </div>
            )}
            {request.quoted_cost_cents && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quoted</span>
                <span>{formatZAR(request.quoted_cost_cents)}</span>
              </div>
            )}
            {request.actual_cost_cents && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual</span>
                <span className="font-heading text-lg">{formatZAR(request.actual_cost_cents)}</span>
              </div>
            )}
            {!contractor && !request.estimated_cost_cents && (
              <p className="text-muted-foreground">No contractor assigned yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="mt-6">
        <CardHeader><CardTitle className="text-lg">Timeline</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
              <span>Request logged — {new Date(request.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {request.ai_triage_at && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
                <span>AI triage: {request.category}, {request.urgency}</span>
              </div>
            )}
            {request.reviewed_at && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
                <span>{request.status === "rejected" ? "Rejected" : "Approved"} — {new Date(request.reviewed_at).toLocaleDateString("en-ZA")}</span>
              </div>
            )}
            {request.work_order_sent_at && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
                <span>Work order sent — {new Date(request.work_order_sent_at).toLocaleDateString("en-ZA")}</span>
              </div>
            )}
            {(updates || []).map((u) => (
              <div key={u.id} className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-info shrink-0" />
                <span className="capitalize">{u.new_status.replaceAll("_", " ")}{u.notes ? ` — ${u.notes}` : ""}</span>
                <span className="text-xs text-muted-foreground ml-auto">{new Date(u.created_at).toLocaleDateString("en-ZA")}</span>
              </div>
            ))}
            {request.completed_at && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-success shrink-0" />
                <span>Completed — {new Date(request.completed_at).toLocaleDateString("en-ZA")}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
