/**
 * app/(dashboard)/maintenance/[requestId]/page.tsx — maintenance request detail page
 *
 * Route:  /maintenance/[requestId]
 * Auth:   gatewaySSR (service client with org scope)
 * Data:   maintenance_requests + 8 joined tables; photos via signed URLs; unified timeline
 * Notes:  Rebuilt per ADDENDUM_45A_UI. StatusStrip + StageRail at top, card grid below.
 */

import { redirect, notFound } from "next/navigation"
import { BackLink } from "@/components/ui/BackLink"
import { MobileMaintenanceView } from "@/components/mobile/MobileMaintenanceView"
import { CriticalIncidentWrapper } from "./CriticalIncidentWrapper"
import { MaintenanceActions } from "./MaintenanceActions"
import { RecordDelayPanel } from "./RecordDelayPanel"
import { StatusStrip } from "@/components/maintenance/StatusStrip"
import { StageRail } from "@/components/maintenance/StageRail"
import { DetailsCard } from "@/components/maintenance/DetailsCard"
import { CostContractorCard } from "@/components/maintenance/CostContractorCard"
import { NotesCard } from "@/components/maintenance/NotesCard"
import { PhotosCard } from "@/components/maintenance/PhotosCard"
import type { MaintenancePhoto } from "@/components/maintenance/PhotosCard"
import { TimelineCard } from "@/components/maintenance/TimelineCard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { buildUnifiedTimeline } from "@/lib/maintenance/timeline"

const INSURANCE_BADGE: Record<string, { label: string; cls: string }> = {
  reported: { label: "Reported to broker",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  declined: { label: "Not claimed",         cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  unsure:   { label: "Decision pending",    cls: "bg-muted text-muted-foreground" },
  pending:  { label: "Decision pending",    cls: "bg-muted text-muted-foreground" },
}

export default async function MaintenanceDetailPage({
  params,
}: Readonly<{ params: Promise<{ requestId: string }> }>) {
  const { requestId } = await params

  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  // ── Main request ──────────────────────────────────────────────────────────────
  const { data: req, error: reqErr } = await db
    .from("maintenance_requests")
    .select(`
      id, title, description, status, urgency, urgency_override, category, category_override,
      access_instructions, special_instructions, contact_name, contact_phone,
      estimated_cost_cents, actual_cost_cents, quoted_cost_cents,
      scheduled_date, scheduled_time_from, scheduled_time_to,
      created_at, ai_triage_at, ai_triage_notes, reviewed_at, reviewed_by,
      work_order_sent_at, work_order_number, work_order_token,
      in_progress_at, completed_at, closed_at, cancelled_at,
      cancellation_reason, cancellation_category,
      contractor_id, tenant_id, logged_by, property_id, unit_id,
      severity, insurance_decision, insurance_decision_at, insurance_decision_notes, org_id,
      units(unit_number, properties(name, address_line1, landlord_id)),
      tenant_view(first_name, last_name, phone),
      contractor_view(first_name, last_name, company_name, email, phone)
    `)
    .eq("id", requestId)
    .eq("org_id", orgId)
    .single()

  if (reqErr || !req) notFound()

  const unit = req.units as unknown as { unit_number: string; properties: { name: string; address_line1: string; landlord_id: string | null } } | null
  const tenant = req.tenant_view as unknown as { first_name: string; last_name: string; phone: string } | null
  const contractor = req.contractor_view as unknown as { first_name: string; last_name: string; company_name: string; email: string; phone: string } | null
  const hasLandlord = Boolean(unit?.properties?.landlord_id)

  const propertyName = unit?.properties?.name ?? null
  const unitNumber   = unit?.unit_number ?? null
  const tenantName   = tenant ? `${tenant.first_name} ${tenant.last_name}`.trim() : null
  const tenantPhone  = tenant?.phone ?? null
  const contractorName = contractor ? (contractor.company_name || `${contractor.first_name} ${contractor.last_name}`.trim()) : null
  const contractorPhone = contractor?.phone ?? null
  const contractorEmail = contractor?.email ?? null

  // ── Parallel data fetch ───────────────────────────────────────────────────────
  const [
    { data: contractorsList },
    { data: auditRows },
    { data: contractorUpdates },
    { data: delayEvents },
    { data: rawPhotos },
    { data: quotes },
    { data: commsRows },
    { data: allocations },
    { data: incidentNotifs },
  ] = await Promise.all([
    db.from("contractors")
      .select("id, first_name, last_name, company_name")
      .eq("org_id", orgId)
      .order("company_name"),
    db.from("audit_log")
      .select("id, action, new_values, old_values, created_at, changed_by, actor_name")
      .eq("table_name", "maintenance_requests")
      .eq("record_id", requestId)
      .order("created_at"),
    db.from("contractor_updates")
      .select("id, new_status, notes, created_at, actor_name")
      .eq("request_id", requestId)
      .order("created_at"),
    db.from("maintenance_delay_events")
      .select("id, delay_type, attributed_to, occurred_at, original_date, rescheduled_to, note")
      .eq("maintenance_id", requestId)
      .eq("org_id", orgId)
      .order("occurred_at", { ascending: false }),
    db.from("maintenance_photos")
      .select("id, storage_path, photo_phase, caption, visible_to_tenant, uploaded_by, created_at, uploader_name")
      .eq("request_id", requestId)
      .order("created_at"),
    db.from("maintenance_quotes")
      .select("id, total_incl_vat_cents, status, created_at, contractor_name")
      .eq("request_id", requestId)
      .order("created_at"),
    db.from("communication_log")
      .select("id, template_key, channel, status, created_at, recipient_name")
      .eq("entity_id", requestId)
      .eq("entity_type", "maintenance_request")
      .order("created_at"),
    db.from("maintenance_cost_allocations")
      .select("id, allocation_type, amount_cents, description, lease_clause_ref, collection_method, added_to_invoice_at, created_at")
      .eq("request_id", requestId)
      .order("created_at"),
    db.from("incident_notifications")
      .select("id, notified_party, channel, sent_at, failed_reason, contacts(first_name, last_name)")
      .eq("maintenance_request_id", requestId)
      .order("sent_at"),
  ])

  // ── Signed photo URLs ─────────────────────────────────────────────────────────
  const service = await createServiceClient()
  const photos: MaintenancePhoto[] = await Promise.all(
    (rawPhotos ?? []).map(async (p) => {
      const storagePath = p.storage_path as string | null
      let signedUrl = ""
      if (storagePath) {
        const { data: signed } = await service.storage
          .from("maintenance-photos")
          .createSignedUrl(storagePath, 60 * 60 * 2) // 2-hour URLs for page view
        signedUrl = signed?.signedUrl ?? ""
      }
      return {
        id: p.id as string,
        signedUrl,
        caption: p.caption as string | null,
        photo_phase: (p.photo_phase as string | null) ?? "before",
        visible_to_tenant: (p.visible_to_tenant as boolean | null) ?? true,
        uploader_name: p.uploader_name as string | null,
        uploaded_at: p.created_at as string,
      }
    })
  )

  // ── Contractors list for ChangeContractorDialog ───────────────────────────────
  const contractors = (contractorsList ?? []).map(c => ({
    id: c.id as string,
    name: (c.company_name as string | null) || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
  }))

  // ── Unified timeline ──────────────────────────────────────────────────────────
  const timelineEvents = buildUnifiedTimeline({
    requestId,
    createdAt: req.created_at as string,
    loggedBy: (req.logged_by as string | null) ?? "agent",
    auditRows: (auditRows ?? []) as Parameters<typeof buildUnifiedTimeline>[0]["auditRows"],
    contractorUpdates: (contractorUpdates ?? []) as Parameters<typeof buildUnifiedTimeline>[0]["contractorUpdates"],
    delayEvents: (delayEvents ?? []) as Parameters<typeof buildUnifiedTimeline>[0]["delayEvents"],
    photos: (rawPhotos ?? []).map(p => ({
      id: p.id as string,
      photo_phase: (p.photo_phase as string | null) ?? "before",
      uploaded_by: p.uploaded_by as string | null,
      visible_to_tenant: (p.visible_to_tenant as boolean | null) ?? true,
      created_at: p.created_at as string,
      uploader_name: p.uploader_name as string | null,
    })),
    quotes: (quotes ?? []).map(q => ({ ...q, amount_cents: (q.total_incl_vat_cents as number | null) ?? 0 })) as Parameters<typeof buildUnifiedTimeline>[0]["quotes"],
    comms: (commsRows ?? []) as Parameters<typeof buildUnifiedTimeline>[0]["comms"],
    costAllocations: (allocations ?? []) as Parameters<typeof buildUnifiedTimeline>[0]["costAllocations"],
  })

  // ── Delay count for StatusStrip ───────────────────────────────────────────────
  const delayCount = (delayEvents ?? []).length
  const firstDelayReason = delayCount > 0
    ? ((delayEvents![0].delay_type as string).replace(/_/g, " "))
    : null

  const isTerminal = ["completed", "closed", "cancelled", "rejected"].includes(req.status as string)
  const insuranceBadge = INSURANCE_BADGE[req.insurance_decision as string ?? ""] ?? INSURANCE_BADGE.pending

  // ── Mobile timeline (legacy) for MobileMaintenanceView ───────────────────────
  const legacyTimeline = timelineEvents.slice(-10).reverse().map(e => ({ label: e.summary, date: e.occurred_at }))
  const persistedNotes = timelineEvents
    .filter(e => e.type === "note")
    .map(e => ({ id: e.id, note: e.summary, createdAt: e.occurred_at }))

  return (
    <div>
      <BackLink href="/maintenance" label="Maintenance" />

      {/* Critical incident dialog — shows on page load when unresolved */}
      {req.severity === "critical" && !req.insurance_decision && (
        <CriticalIncidentWrapper
          requestId={requestId}
          incidentTitle={req.title as string}
          unitLabel={unit ? `Unit ${unitNumber}` : "Property"}
          propertyName={propertyName ?? ""}
        />
      )}

      {/* ── Mobile view ─────────────────────────────────────────────────────── */}
      <div className="lg:hidden">
        <MobileMaintenanceView
          requestId={requestId}
          title={req.title as string}
          description={(req.description as string | null) ?? ""}
          status={req.status as string}
          urgency={(req.urgency_override ?? req.urgency) as string | null}
          category={(req.category_override ?? req.category) as string | null}
          workOrderNumber={req.work_order_number as string | null}
          unitLabel={unit ? `${unitNumber}, ${propertyName}` : ""}
          tenantName={tenantName}
          tenantPhone={tenantPhone}
          contractorName={contractorName}
          contractorPhone={contractorPhone}
          aiTriageNotes={req.ai_triage_notes as string | null}
          photoCount={photos.length}
          timeline={legacyTimeline}
          persistedNotes={persistedNotes}
        />
      </div>

      {/* ── Desktop view ────────────────────────────────────────────────────── */}
      <div className="hidden lg:block space-y-4">

        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl leading-tight truncate">{req.title as string}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {req.work_order_number && <span className="font-mono">{req.work_order_number as string} · </span>}
              {unit ? `Unit ${unitNumber}, ${propertyName}` : ""}
              {(req.category_override ?? req.category) ? ` · ${req.category_override ?? req.category}` : ""}
            </p>
          </div>
          <MaintenanceActions
            requestId={requestId}
            status={req.status as string}
            actualCostCents={(req.actual_cost_cents as number | null) ?? null}
            contractorId={(req.contractor_id as string | null) ?? null}
          />
        </div>

        {/* Status strip */}
        <StatusStrip
          status={req.status as string}
          contractorName={contractorName}
          scheduledDate={req.scheduled_date as string | null}
          scheduledTimeFrom={req.scheduled_time_from as string | null}
          scheduledTimeTo={req.scheduled_time_to as string | null}
          estimatedCostCents={req.estimated_cost_cents as number | null}
          actualCostCents={req.actual_cost_cents as number | null}
          createdAt={req.created_at as string}
          delayCount={delayCount}
          firstDelayReason={firstDelayReason}
        />

        {/* Stage rail */}
        <StageRail
          currentStatus={req.status as string}
          createdAt={req.created_at as string}
          aiTriageAt={req.ai_triage_at as string | null}
          reviewedAt={req.reviewed_at as string | null}
          reviewedBy={req.reviewed_by as string | null}
          workOrderSentAt={req.work_order_sent_at as string | null}
          scheduledDate={req.scheduled_date as string | null}
          inProgressAt={req.in_progress_at as string | null}
          completedAt={req.completed_at as string | null}
          closedAt={req.closed_at as string | null}
        />

        {/* Critical incident card */}
        {req.severity === "critical" && (
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Insurance decision
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm pb-4">
              {req.insurance_decision ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${insuranceBadge.cls}`}>
                      {insuranceBadge.label}
                    </span>
                    {req.insurance_decision_at && (
                      <span className="text-xs text-muted-foreground">
                        · {new Date(req.insurance_decision_at as string).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  {req.insurance_decision_notes && (
                    <p className="text-xs text-muted-foreground italic">&quot;{req.insurance_decision_notes as string}&quot;</p>
                  )}
                  {(incidentNotifs ?? []).length > 0 && (
                    <div className="pt-1 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Notifications sent:</p>
                      {(incidentNotifs ?? []).map((n) => {
                        const contact = n.contacts as unknown as { first_name: string; last_name: string } | null
                        const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : null
                        const party = (n.notified_party as string) === "managing_scheme"
                          ? "Managing scheme"
                          : ((n.notified_party as string).charAt(0).toUpperCase() + (n.notified_party as string).slice(1))
                        return (
                          <div key={n.id as string} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={n.failed_reason ? "text-danger" : "text-success"}>{n.failed_reason ? "✗" : "✓"}</span>
                            <span>{party}{name ? ` · ${name}` : ""}</span>
                            <span className="text-muted-foreground/60">· {n.channel as string}</span>
                            <span className="ml-auto">
                              {new Date(n.sent_at as string).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
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

        {/* Main two-col grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <DetailsCard
            requestId={requestId}
            status={req.status as string}
            title={req.title as string}
            description={req.description as string | null}
            category={(req.category as string | null) ?? null}
            categoryOverride={(req.category_override as string | null) ?? null}
            urgency={(req.urgency as string | null) ?? null}
            urgencyOverride={(req.urgency_override as string | null) ?? null}
            accessInstructions={(req.access_instructions as string | null) ?? null}
            specialInstructions={(req.special_instructions as string | null) ?? null}
            contactName={(req.contact_name as string | null) ?? null}
            contactPhone={(req.contact_phone as string | null) ?? null}
            estimatedCostCents={(req.estimated_cost_cents as number | null) ?? null}
            scheduledDate={(req.scheduled_date as string | null) ?? null}
            scheduledTimeFrom={(req.scheduled_time_from as string | null) ?? null}
            scheduledTimeTo={(req.scheduled_time_to as string | null) ?? null}
            tenantName={tenantName}
            tenantPhone={tenantPhone}
            propertyName={propertyName}
            unitNumber={unitNumber}
          />
          <CostContractorCard
            requestId={requestId}
            status={req.status as string}
            contractorId={(req.contractor_id as string | null) ?? null}
            contractorName={contractorName}
            contractorPhone={contractorPhone}
            contractorEmail={contractorEmail}
            contractors={contractors}
            estimatedCostCents={(req.estimated_cost_cents as number | null) ?? null}
            actualCostCents={(req.actual_cost_cents as number | null) ?? null}
            workOrderNumber={(req.work_order_number as string | null) ?? null}
          />
        </div>

        {/* Notes + Photos row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <NotesCard requestId={requestId} hasLandlord={hasLandlord} isReadOnly={isTerminal} />
          <PhotosCard photos={photos} isReadOnly={isTerminal} />
        </div>

        {/* Cost allocations (if any, after sign-off) */}
        {(allocations ?? []).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Cost allocations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(allocations ?? []).map((a) => (
                <div key={a.id as string} className="space-y-0.5">
                  <div className="flex justify-between items-baseline">
                    <span className={`text-xs font-medium uppercase tracking-wide ${a.allocation_type === "landlord_expense" ? "text-muted-foreground" : "text-warning"}`}>
                      {a.allocation_type === "landlord_expense" ? "Landlord expense" : "Tenant charge"}
                    </span>
                    <span className="font-medium">{formatZAR(a.amount_cents as number)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.description as string}</p>
                  {a.lease_clause_ref && <p className="text-xs text-muted-foreground">Clause {a.lease_clause_ref as string}</p>}
                  {a.allocation_type === "tenant_charge" && a.collection_method && (
                    <p className="text-xs text-muted-foreground">
                      {a.collection_method === "next_invoice" && "→ Next rent invoice"}
                      {a.collection_method === "separate_invoice" && "→ Separate invoice"}
                      {a.collection_method === "deposit_deduction" && "→ Deduct from deposit at lease end"}
                      {a.collection_method === "already_paid" && "→ Paid on-site"}
                      {a.added_to_invoice_at && ` (added ${new Date(a.added_to_invoice_at as string).toLocaleDateString("en-ZA")})`}
                    </p>
                  )}
                  {a.allocation_type === "landlord_expense" && (
                    <p className="text-xs text-muted-foreground">→ Owner statement</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Delay log + record panel (includes delay history) */}
        <Card>
          <CardContent className="pt-4">
            <RecordDelayPanel requestId={requestId} initialDelays={(delayEvents ?? []) as Parameters<typeof RecordDelayPanel>[0]["initialDelays"]} />
          </CardContent>
        </Card>

        {/* Unified timeline */}
        <TimelineCard events={timelineEvents} />

      </div>{/* end desktop */}
    </div>
  )
}
