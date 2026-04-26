"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { getTenantSession } from "@/lib/portal/getTenantSession"

interface MaintenanceSubmitPayload {
  category: string
  description: string
  urgency: string
  aiSuggestedUrgency: string | null
  consentVersion: "v1_pleks_template" | "v1_custom_lease"
  photoStoragePaths: string[]
}

export async function submitMaintenanceRequest(payload: MaintenanceSubmitPayload) {
  const session = await getTenantSession()
  if (!session) return { error: "Not authenticated" }

  const { tenantId, leaseId, orgId, unitId } = session
  const service = await createServiceClient()

  // Get property_id from the unit
  const { data: unit, error: unitErr } = await service
    .from("units")
    .select("property_id")
    .eq("id", unitId)
    .single()

  if (unitErr || !unit) return { error: "Could not resolve unit" }

  // Validate input
  if (!payload.description || payload.description.trim().length < 20) {
    return { error: "Description must be at least 20 characters" }
  }

  const validCategories = [
    "plumbing", "electrical", "structural", "appliances",
    "pest_control", "keys_locks", "general", "other",
  ]
  if (!validCategories.includes(payload.category)) {
    return { error: "Invalid category" }
  }

  const validUrgencies = ["emergency", "urgent", "routine", "cosmetic"]
  if (!validUrgencies.includes(payload.urgency)) {
    return { error: "Invalid urgency" }
  }

  // Create maintenance request
  const { data: request, error: reqErr } = await service
    .from("maintenance_requests")
    .insert({
      org_id: orgId,
      unit_id: unitId,
      property_id: unit.property_id,
      lease_id: leaseId,
      tenant_id: tenantId,
      title: `${payload.category.replaceAll("_", " ")} — tenant report`.replace(/^\w/, (c) => c.toUpperCase()),
      description: payload.description.trim(),
      category: payload.category,
      urgency: payload.urgency,
      tenant_reported_urgency: payload.urgency,
      ai_suggested_urgency: payload.aiSuggestedUrgency,
      logged_by: "tenant",
      reported_via: "portal",
      status: "pending_review",
    })
    .select("id, work_order_number")
    .single()

  if (reqErr || !request) {
    console.error("submitMaintenanceRequest failed:", reqErr?.message)
    return { error: "Could not submit request. Please try again." }
  }

  // Log consent
  await service.from("consent_log").insert({
    org_id: orgId,
    tenant_id: tenantId,
    consent_type: "maintenance_cost_liability",
    consent_version: payload.consentVersion,
    given_at: new Date().toISOString(),
    given_via: "tenant_portal",
    reference_id: request.id,
  })

  // Audit log
  await service.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_requests",
    record_id: request.id,
    action: "INSERT",
    changed_by: tenantId,
    new_values: {
      action: "tenant_portal_submission",
      category: payload.category,
      urgency: payload.urgency,
    },
  })

  return { success: true, requestId: request.id, workOrderNumber: request.work_order_number }
}
