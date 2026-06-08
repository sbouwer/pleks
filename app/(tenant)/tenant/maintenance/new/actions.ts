"use server"

/**
 * app/(tenant)/tenant/maintenance/new/actions.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

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

  // Get property_id + the routing agent from the unit.
  const { data: unit, error: unitErr } = await service
    .from("units")
    .select("property_id, assigned_agent_id")
    .eq("id", unitId)
    .single()

  if (unitErr || !unit) return { error: "Could not resolve unit" }

  // Tenant-reported → no creating agent. Route to the responsible agent (unit agent → property manager) so
  // it lands in their My-work; null falls to Everyone/Org (ADDENDUM_TEAMS D-11/12), visible under All.
  let routedAgent: string | null = unit.assigned_agent_id ?? null
  if (!routedAgent) {
    const { data: prop, error: propErr } = await service
      .from("properties").select("managing_agent_id").eq("id", unit.property_id).maybeSingle()
    if (propErr) console.error("submitMaintenanceRequest property routing:", propErr.message)
    routedAgent = prop?.managing_agent_id ?? null
  }

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
      assigned_user_id: routedAgent,
      assigned_at: routedAgent ? new Date().toISOString() : null,
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
    consent_type: "maintenance_cost_liability",
    consent_version: payload.consentVersion,
    consent_given: true,
    metadata: { tenant_id: tenantId, given_via: "tenant_portal", reference_id: request.id },
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
