/**
 * app/api/maintenance/[id]/schedule/route.ts — set or update maintenance appointment date/time
 *
 * Route:  POST /api/maintenance/[id]/schedule
 * Auth:   Supabase auth.getUser() + user_orgs membership check
 * Data:   maintenance_requests, tenant_view, units, contractors, audit_log, communication_log
 * Notes:  M3 comm fires to tenant when scheduled_date is set (maintenance.scheduled). BUILD_63 Phase 6.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import * as React from "react"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { routeAndSend } from "@/lib/messaging/router"
import { MaintenanceScheduledEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-scheduled"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateLongZA } from "@/lib/dates"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("POST user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const orgId = membership.org_id as string

  const body = await req.json() as {
    scheduledDate: string
    scheduledTimeFrom?: string
    scheduledTimeTo?: string
  }

  if (!body.scheduledDate) {
    return NextResponse.json({ error: "scheduledDate is required" }, { status: 400 })
  }

  const { data: current, error: currentError } = await service
    .from("maintenance_requests")
    .select("scheduled_date, tenant_notified_of_schedule")
    .eq("id", requestId)
    .eq("org_id", orgId)
    .single()
    logQueryError("POST maintenance_requests", currentError)

  const scheduleChanged =
    current?.scheduled_date !== body.scheduledDate ||
    !current?.tenant_notified_of_schedule

  const { error: updateError } = await service
    .from("maintenance_requests")
    .update({
      scheduled_date: body.scheduledDate,
      scheduled_time_from: body.scheduledTimeFrom ?? null,
      scheduled_time_to: body.scheduledTimeTo ?? null,
      tenant_notified_of_schedule: true,
    })
    .eq("id", requestId)
    .eq("org_id", orgId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await service.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: {
      scheduled_date: body.scheduledDate,
      scheduled_time_from: body.scheduledTimeFrom ?? null,
      scheduled_time_to: body.scheduledTimeTo ?? null,
    },
  })

  // M3 — notify tenant of confirmed appointment (non-fatal)
  if (scheduleChanged) {
    void sendM3Comm(service, orgId, requestId, user.id, body)
  }

  return NextResponse.json({ ok: true })
}

type ServiceClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createServiceClient>>
type ScheduleBody = { scheduledDate: string; scheduledTimeFrom?: string; scheduledTimeTo?: string }

async function sendM3Comm(
  service: ServiceClient,
  orgId: string,
  requestId: string,
  userId: string,
  body: ScheduleBody,
): Promise<void> {
  try {
    const { data: req, error: reqError } = await service
      .from("maintenance_requests")
      .select("tenant_id, unit_id, title, contractor_id")
      .eq("id", requestId)
      .single()
    logQueryError("sendM3Comm maintenance_requests", reqError)
    if (!req?.tenant_id) return

    const [tenantRes, unitRes, contractorRes, orgSettings] = await Promise.all([
      service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", req.tenant_id).single(),
      service.from("units").select("unit_number, properties(name)").eq("id", req.unit_id).single(),
      req.contractor_id
        ? service.from("contractor_view").select("first_name, last_name, company_name").eq("id", req.contractor_id).single()
        : Promise.resolve({ data: null }),
      fetchOrgSettings(orgId),
    ])

    const tenant = tenantRes.data
    if (!tenant?.email) return

    const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
    const contractor = contractorRes.data
    const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
    const contractorName = contractor
      ? (contractor.company_name as string | null) ||
        [contractor.first_name, contractor.last_name].filter(Boolean).join(" ") ||
        undefined
      : undefined
    const scheduledDateDisplay = fmtDateLongZA(body.scheduledDate)

    await routeAndSend({
      orgId,
      tenantId: req.tenant_id as string,
      templateKey: "maintenance.scheduled",
      to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
      subject: `Maintenance appointment — ${scheduledDateDisplay}`,
      emailElement: React.createElement(MaintenanceScheduledEmail, {
        branding: buildBranding(orgSettings),
        tenantName, propertyLabel,
        requestTitle: req.title as string,
        scheduledDate: scheduledDateDisplay,
        scheduledTimeFrom: body.scheduledTimeFrom,
        scheduledTimeTo: body.scheduledTimeTo,
        contractorName,
        senderName: orgSettings?.name ?? "Pleks",
      }),
      entityType: "maintenance_request",
      entityId: requestId,
      triggeredBy: userId,
      triggerEventType: "maintenance_state",
      triggerEventId: requestId,
      toneVariant: "n/a",
    })
  } catch {
    // non-fatal
  }
}
