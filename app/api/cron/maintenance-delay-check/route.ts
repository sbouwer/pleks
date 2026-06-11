/**
 * app/api/cron/maintenance-delay-check/route.ts — daily cron: insert delay events and notify tenants (M6)
 *
 * Route:  GET /api/cron/maintenance-delay-check
 * Auth:   x-cron-secret header
 * Data:   maintenance_requests, maintenance_delay_events, tenant_view, units, communication_log
 * Notes:  Two checks per run:
 *         (1) pending_review >48h → agent_pending_approval delay event (internal, no tenant comm)
 *         (2) work_order_sent + no contractor update >48h → contractor_no_response delay event + M6 tenant comm
 *         maybeInsertDelayEvent is idempotent (one event per type per request).
 *         BUILD_63 Phase 6.
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import * as React from "react"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { routeAndSend } from "@/lib/messaging/router"
import { MaintenanceDelayEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-delay"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { withCronRun } from "@/lib/cron/withCronRun"

type Service = Awaited<ReturnType<typeof createServiceClient>>

// Human-readable reason shown in the M6 tenant email per delay_type
const DELAY_REASON_LABEL: Record<string, string> = {
  tenant_not_available:           "we could not complete the appointment as access was unavailable",
  tenant_rescheduled:             "a rescheduling was requested",
  tenant_no_response:             "we could not confirm access with you",
  tenant_denied_access:           "access was not available at the scheduled time",
  contractor_no_show:             "the contractor was unable to attend",
  contractor_rescheduled:         "the contractor has requested a schedule change",
  contractor_no_response:         "we are still confirming details with the assigned contractor",
  contractor_returned_incomplete: "the work was not fully completed and requires a follow-up visit",
  agent_pending_approval:         "we are finalising the approval process",
  agent_pending_quote_review:     "we are reviewing the quote",
  agent_pending_landlord_approval:"we are awaiting landlord approval",
  parts_on_order:                 "parts are on order and need to arrive before work can continue",
  weather:                        "adverse weather conditions have caused a delay",
  access_issue_other:             "an access issue has caused a delay",
}

// Returns true if a NEW delay event was inserted (false if one already existed)
async function maybeInsertDelayEvent(
  service: Service,
  maintenanceId: string,
  orgId: string,
  delayType: string,
): Promise<boolean> {
  const { data: existing, error: existingError } = await service
    .from("maintenance_delay_events")
    .select("id")
    .eq("maintenance_id", maintenanceId)
    .eq("delay_type", delayType)
    .limit(1)
    .maybeSingle()
    logQueryError("maybeInsertDelayEvent maintenance_delay_events", existingError)

  if (existing) return false

  await service.from("maintenance_delay_events").insert({
    org_id: orgId,
    maintenance_id: maintenanceId,
    delay_type: delayType,
    attributed_to: delayType.startsWith("agent") ? "agent" : "contractor",
    recorded_by: "00000000-0000-0000-0000-000000000000",
  })

  return true
}

async function fireDelayComm(
  service: Service,
  maintenanceId: string,
  orgId: string,
  delayType: string,
): Promise<void> {
  const { data: req, error: reqError } = await service
    .from("maintenance_requests")
    .select("tenant_id, unit_id, title")
    .eq("id", maintenanceId)
    .single()
    logQueryError("fireDelayComm maintenance_requests", reqError)

  if (!req?.tenant_id) return

  const [tenantRes, unitRes, orgSettings, orgRow] = await Promise.all([
    service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", req.tenant_id).single(),
    service.from("units").select("unit_number, properties(name)").eq("id", req.unit_id).single(),
    fetchOrgSettings(orgId),
    service.from("organisations").select("settings").eq("id", orgId).single(),
  ])

  const tenant = tenantRes.data
  const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
  if (!tenant?.email) return

  const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
  const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
  const senderName = orgSettings?.name ?? "Pleks"
  const delayReason = DELAY_REASON_LABEL[delayType] ?? "an unexpected delay has occurred"

  // Resolve org tone for relational template
  const orgTone = (() => {
    const s = (orgRow.data?.settings ?? {}) as Record<string, unknown>
    const c = (s.communication ?? {}) as Record<string, unknown>
    const t = c.tone_tenant as string | undefined
    return t === "friendly" || t === "firm" ? t : "professional"
  })()

  await routeAndSend({
    orgId,
    tenantId: req.tenant_id as string,
    templateKey: "maintenance.delay",
    to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
    subject: `Maintenance update — delay on your request at ${propertyLabel}`,
    emailElement: React.createElement(MaintenanceDelayEmail, {
      branding: buildBranding(orgSettings),
      tenantName,
      propertyLabel,
      requestTitle: req.title as string,
      delayReason,
      senderName,
      toneVariant: orgTone,
    }),
    entityType: "maintenance_request",
    entityId: maintenanceId,
    triggerEventType: "cron:maintenance-delay-check",
    triggerEventId: maintenanceId,
    toneVariant: orgTone,
  })
}

export const GET = withCronRun("maintenance_delay_check", handler)

async function handler(_req: NextRequest): Promise<Response> {

  const service = await createServiceClient()
  const now = new Date()
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

  let agentPendingCount = 0
  let contractorNoResponseCount = 0

  // 1. Requests stuck in pending_review for >48h → internal delay event only (no tenant comm)
  const { data: pendingReview, error: err1 } = await service
    .from("maintenance_requests")
    .select("id, org_id")
    .eq("status", "pending_review")
    .lt("created_at", cutoff48h)

  if (err1) {
    console.error("[maintenance-delay-check] pending_review query failed:", err1.message)
  } else {
    for (const item of pendingReview ?? []) {
      await maybeInsertDelayEvent(service, item.id, item.org_id, "agent_pending_approval")
      agentPendingCount++
    }
  }

  // 2. work_order_sent + no contractor update >48h → delay event + M6 tenant comm
  const { data: unacknowledged, error: err2 } = await service
    .from("maintenance_requests")
    .select("id, org_id")
    .eq("status", "work_order_sent")
    .lt("work_order_sent_at", cutoff48h)

  if (err2) {
    console.error("[maintenance-delay-check] work_order_sent query failed:", err2.message)
  } else {
    for (const item of unacknowledged ?? []) {
      const { data: updates, error: updatesError } = await service
        .from("contractor_updates")
        .select("id")
        .eq("request_id", item.id)
        .limit(1)
        .maybeSingle()
        logQueryError("GET contractor_updates", updatesError)

      if (!updates) {
        const inserted = await maybeInsertDelayEvent(service, item.id, item.org_id, "contractor_no_response")
        contractorNoResponseCount++

        if (inserted) {
          try {
            await fireDelayComm(service, item.id, item.org_id, "contractor_no_response")
          } catch (err) {
            console.error("[maintenance-delay-check] M6 comm failed for", item.id, ":", err)
          }
        }
      }
    }
  }

  return Response.json({
    ok: true,
    agent_pending: agentPendingCount,
    contractor_no_response: contractorNoResponseCount,
  })
}
