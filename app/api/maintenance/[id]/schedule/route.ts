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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

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

  // M3 — notify tenant of confirmed appointment
  try {
    const { data: maintenanceReq } = await service
      .from("maintenance_requests")
      .select("tenant_id, unit_id, title, contractor_id")
      .eq("id", requestId)
      .single()

    if (maintenanceReq?.tenant_id) {
      const [tenantRes, unitRes, contractorRes, orgSettings] = await Promise.all([
        service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", maintenanceReq.tenant_id).single(),
        service.from("units").select("unit_number, properties(name)").eq("id", maintenanceReq.unit_id).single(),
        maintenanceReq.contractor_id
          ? service.from("contractors").select("first_name, last_name, company_name").eq("id", maintenanceReq.contractor_id).single()
          : Promise.resolve({ data: null }),
        fetchOrgSettings(orgId),
      ])

      const tenant = tenantRes.data
      const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
      const contractor = contractorRes.data

      if (tenant?.email) {
        const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
        const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
        const contractorName = contractor
          ? (contractor.company_name as string | null) ||
            [contractor.first_name, contractor.last_name].filter(Boolean).join(" ") ||
            undefined
          : undefined

        const scheduledDateDisplay = new Date(body.scheduledDate).toLocaleDateString("en-ZA", {
          day: "numeric", month: "long", year: "numeric",
        })

        await routeAndSend({
          orgId,
          tenantId: maintenanceReq.tenant_id as string,
          templateKey: "maintenance.scheduled",
          to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
          subject: `Maintenance appointment — ${scheduledDateDisplay}`,
          emailElement: React.createElement(MaintenanceScheduledEmail, {
            branding: buildBranding(orgSettings),
            tenantName,
            propertyLabel,
            requestTitle: maintenanceReq.title as string,
            scheduledDate: scheduledDateDisplay,
            scheduledTimeFrom: body.scheduledTimeFrom,
            scheduledTimeTo: body.scheduledTimeTo,
            contractorName,
            senderName: orgSettings?.name ?? "Pleks",
          }),
          entityType: "maintenance_request",
          entityId: requestId,
          triggeredBy: user.id,
          triggerEventType: "maintenance_state",
          triggerEventId: requestId,
          toneVariant: "n/a",
        })
      }
    }
  } catch {
    // Comm non-fatal
  }

  return NextResponse.json({ ok: true })
}
