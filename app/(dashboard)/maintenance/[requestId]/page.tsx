import { createClient } from "@/lib/supabase/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect, notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"
import { MaintenanceActions } from "./MaintenanceActions"
import { RecordDelayPanel } from "./RecordDelayPanel"
import { MobileMaintenanceView } from "@/components/mobile/MobileMaintenanceView"
import { BackLink } from "@/components/ui/BackLink"
import { CriticalIncidentWrapper } from "./CriticalIncidentWrapper"

interface ContractorUpdate {
  id: string
  new_status: string
  notes: string | null
  created_at: string
}

interface MaintenanceRequestForTimeline {
  created_at: string
  ai_triage_at: string | null
  ai_triage_notes: string | null
  category: string | null
  urgency: string | null
  reviewed_at: string | null
  status: string
  work_order_sent_at: string | null
  completed_at: string | null
}

function buildTimeline(
  request: MaintenanceRequestForTimeline,
  updates: ContractorUpdate[]
): Array<{ label: string; date: string }> {
  const items: Array<{ label: string; date: string }> = []

  items.push({
    label: "Request logged",
    date: new Date(request.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  })

  if (request.ai_triage_at) {
    items.push({
      label: `AI triage: ${request.category ?? ""}, ${request.urgency ?? ""}`,
      date: new Date(request.ai_triage_at).toLocaleDateString("en-ZA"),
    })
  }

  if (request.reviewed_at) {
    items.push({
      label: request.status === "rejected" ? "Rejected" : "Approved",
      date: new Date(request.reviewed_at).toLocaleDateString("en-ZA"),
    })
  }

  if (request.work_order_sent_at) {
    items.push({
      label: "Work order sent",
      date: new Date(request.work_order_sent_at).toLocaleDateString("en-ZA"),
    })
  }

  for (const u of updates) {
    items.push({
      label: u.notes ? `${u.new_status.replaceAll("_", " ")} — ${u.notes}` : u.new_status.replaceAll("_", " "),
      date: new Date(u.created_at).toLocaleDateString("en-ZA"),
    })
  }

  if (request.completed_at) {
    items.push({
      label: "Completed",
      date: new Date(request.completed_at).toLocaleDateString("en-ZA"),
    })
  }

  return items
}

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
}: Readonly<{
  params: Promise<{ requestId: string }>
}>) {
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

  // Get contractor updates, cost allocations, agent notes, and incident notifications in parallel
  const [{ data: updates }, { data: allocations }, { data: noteLog }, { data: incidentNotifs }] = await Promise.all([
    supabase
      .from("contractor_updates")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false }),
    supabase
      .from("maintenance_cost_allocations")
      .select("id, allocation_type, amount_cents, description, lease_clause_ref, collection_method, added_to_invoice_at")
      .eq("request_id", requestId)
      .order("created_at"),
    supabase
      .from("audit_log")
      .select("id, new_values, created_at")
      .eq("table_name", "maintenance_requests")
      .eq("record_id", requestId)
      .eq("action", "NOTE")
      .order("created_at", { ascending: true }),
    supabase
      .from("incident_notifications")
      .select("id, notified_party, channel, sent_at, failed_reason, contacts(first_name, last_name)")
      .eq("maintenance_request_id", requestId)
      .order("sent_at", { ascending: true }),
  ])

  const persistedNotes = (noteLog ?? []).map((row) => ({
    id: row.id as string,
    note: ((row.new_values as Record<string, string> | null)?.note) ?? "",
    createdAt: row.created_at as string,
  })).filter((n) => n.note)

  // Delay events — requires org context, use gateway
  const gw = await gatewaySSR()
  const { data: delayEvents } = gw
    ? await gw.db
        .from("maintenance_delay_events")
        .select("id, delay_type, attributed_to, occurred_at, original_date, rescheduled_to, note")
        .eq("maintenance_id", requestId)
        .eq("org_id", gw.orgId)
        .order("occurred_at", { ascending: false })
    : { data: [] }

  const timeline = buildTimeline(request, (updates ?? []) as ContractorUpdate[])

  const INSURANCE_BADGE: Record<string, { label: string; cls: string }> = {
    reported: { label: "Reported to broker",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    declined: { label: "Not claimed",         cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    unsure:   { label: "Decision pending",    cls: "bg-muted text-muted-foreground" },
    pending:  { label: "Decision pending",    cls: "bg-muted text-muted-foreground" },
  }
  const insuranceBadge = INSURANCE_BADGE[request.insurance_decision ?? ""] ?? INSURANCE_BADGE.pending

  return (
    <div>
      <BackLink href="/maintenance" label="Maintenance" />

      {/* Critical incident dialog — shows on page load when unresolved */}
      {request.severity === "critical" && !request.insurance_decision && (
        <CriticalIncidentWrapper
          requestId={requestId}
          incidentTitle={request.title}
          unitLabel={unit ? `Unit ${unit.unit_number}` : "Property"}
          propertyName={unit?.properties.name ?? ""}
        />
      )}
      {/* Mobile view */}
      <div className="lg:hidden">
        <MobileMaintenanceView
          requestId={requestId}
          title={request.title}
          description={request.description}
          status={request.status}
          urgency={request.urgency ?? null}
          category={request.category ?? null}
          workOrderNumber={request.work_order_number ?? null}
          unitLabel={unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
          tenantName={tenant ? `${tenant.first_name} ${tenant.last_name}` : null}
          tenantPhone={tenant?.phone ?? null}
          contractorName={contractor ? (contractor.company_name || `${contractor.first_name} ${contractor.last_name}`.trim()) : null}
          contractorPhone={contractor?.phone ?? null}
          aiTriageNotes={request.ai_triage_notes ?? null}
          photoCount={0}
          timeline={timeline}
          persistedNotes={persistedNotes}
        />
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl">{request.title}</h1>
            <StatusBadge status={STATUS_MAP[request.status] || "pending"} />
          </div>
          <p className="text-muted-foreground">
            {request.work_order_number && `${request.work_order_number} · `}
            {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
            {request.category && ` · ${request.category}`}
          </p>
        </div>
        <MaintenanceActions requestId={requestId} status={request.status} actualCostCents={request.actual_cost_cents ?? null} />
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

      {/* Insurance decision — only for critical incidents */}
      {request.severity === "critical" && (
        <Card className="mb-4 border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Insurance decision
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm pb-4">
            {request.insurance_decision ? (
              <>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${insuranceBadge.cls}`}>
                    {insuranceBadge.label}
                  </span>
                  {request.insurance_decision_at && (
                    <span className="text-xs text-muted-foreground">
                      · {new Date(request.insurance_decision_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {request.insurance_decision_notes && (
                  <p className="text-xs text-muted-foreground italic">&quot;{request.insurance_decision_notes}&quot;</p>
                )}
                {(incidentNotifs ?? []).length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Notifications sent:</p>
                    {(incidentNotifs ?? []).map((n) => {
                      const contact = n.contacts as unknown as { first_name: string; last_name: string } | null
                      const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : null
                      const party = n.notified_party === "managing_scheme" ? "Managing scheme" : n.notified_party.charAt(0).toUpperCase() + n.notified_party.slice(1)
                      return (
                        <div key={n.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={n.failed_reason ? "text-danger" : "text-success"}>
                            {n.failed_reason ? "✗" : "✓"}
                          </span>
                          <span>{party}{name ? ` · ${name}` : ""}</span>
                          <span className="text-muted-foreground/60">· {n.channel}</span>
                          <span className="ml-auto">
                            {new Date(n.sent_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Insurance decision pending — open this request to resolve.
              </p>
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

            {/* Allocation breakdown (after sign-off) */}
            {(allocations ?? []).length > 0 && (
              <div className="pt-3 border-t border-border space-y-3">
                {(allocations ?? []).map((a) => (
                  <div key={a.id} className="space-y-0.5">
                    <div className="flex justify-between items-baseline">
                      <span className={`text-xs font-medium uppercase tracking-wide ${a.allocation_type === "landlord_expense" ? "text-muted-foreground" : "text-warning"}`}>
                        {a.allocation_type === "landlord_expense" ? "Landlord expense" : "Tenant charge"}
                      </span>
                      <span className="font-medium">{formatZAR(a.amount_cents)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                    {a.lease_clause_ref && (
                      <p className="text-xs text-muted-foreground">Clause {a.lease_clause_ref}</p>
                    )}
                    {a.allocation_type === "tenant_charge" && a.collection_method && (
                      <p className="text-xs text-muted-foreground">
                        {a.collection_method === "next_invoice" && "→ Next rent invoice"}
                        {a.collection_method === "separate_invoice" && "→ Separate invoice"}
                        {a.collection_method === "deposit_deduction" && "→ Deduct from deposit at lease end"}
                        {a.collection_method === "already_paid" && "→ Paid on-site"}
                        {a.added_to_invoice_at && ` (added ${new Date(a.added_to_invoice_at).toLocaleDateString("en-ZA")})`}
                      </p>
                    )}
                    {a.allocation_type === "landlord_expense" && (
                      <p className="text-xs text-muted-foreground">→ Owner statement</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delay log */}
      <Card className="mt-6">
        <CardContent className="pt-4">
          <RecordDelayPanel requestId={requestId} initialDelays={delayEvents ?? []} />
        </CardContent>
      </Card>

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
      </div>{/* end desktop */}
    </div>
  )
}
