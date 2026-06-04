/**
 * app/api/maintenance/[id]/assign/route.ts — assign a contractor to a maintenance request
 *
 * Route:  POST /api/maintenance/[id]/assign
 * Auth:   Supabase auth.getUser() + user_orgs membership check
 * Data:   maintenance_requests, contractors, tenant_view, units, audit_log, communication_log
 * Notes:  M2 comm fires to tenant when contractor_id is set (maintenance.assigned). BUILD_63 Phase 6.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import * as React from "react"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { routeAndSend } from "@/lib/messaging/router"
import { MaintenanceAssignedEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-assigned"
import { logQueryError } from "@/lib/supabase/logQueryError"

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

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No org" }, { status: 403 })
  }

  const orgId = membership.org_id as string

  const body = await req.json() as { contractorId?: string }
  const contractorId = body.contractorId?.trim()
  if (!contractorId) {
    return NextResponse.json({ error: "contractorId is required" }, { status: 400 })
  }

  const { data: current, error: currentError } = await service
    .from("maintenance_requests")
    .select("contractor_id")
    .eq("id", requestId)
    .eq("org_id", orgId)
    .single()
    logQueryError("POST maintenance_requests", currentError)

  const contractorChanged = current?.contractor_id !== contractorId

  const { error: updateError } = await service
    .from("maintenance_requests")
    .update({ contractor_id: contractorId })
    .eq("id", requestId)
    .eq("org_id", orgId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await service.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: { contractor_id: contractorId },
  })

  // M2 — notify tenant that a contractor has been assigned
  try {
    const { data: maintenanceReq, error: maintenanceReqError } = await service
      .from("maintenance_requests")
      .select("tenant_id, unit_id, title")
      .eq("id", requestId)
      .single()
    logQueryError("POST maintenance_requests", maintenanceReqError)

    const { data: contractor, error: contractorError } = await service
      .from("contractor_view")
      .select("first_name, last_name, company_name")
      .eq("id", contractorId)
      .single()
    logQueryError("POST contractors", contractorError)

    if (maintenanceReq?.tenant_id) {
      const [tenantRes, unitRes, orgSettings] = await Promise.all([
        service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", maintenanceReq.tenant_id).single(),
        service.from("units").select("unit_number, properties(name)").eq("id", maintenanceReq.unit_id).single(),
        fetchOrgSettings(orgId),
      ])
      const tenant = tenantRes.data
      const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null

      if (tenant?.email && contractorChanged) {
        const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
        const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
        const contractorName =
          (contractor?.company_name as string | null) ||
          [contractor?.first_name, contractor?.last_name].filter(Boolean).join(" ") ||
          "Contractor"

        await routeAndSend({
          orgId,
          tenantId: maintenanceReq.tenant_id as string,
          templateKey: "maintenance.assigned",
          to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
          subject: `Contractor assigned — ${maintenanceReq.title}`,
          emailElement: React.createElement(MaintenanceAssignedEmail, {
            branding: buildBranding(orgSettings),
            tenantName,
            propertyLabel,
            requestTitle: maintenanceReq.title as string,
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

  return NextResponse.json({ success: true })
}
