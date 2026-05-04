"use server"

/**
 * lib/actions/maintenance.ts — server actions for maintenance request lifecycle
 *
 * Auth:   gateway() — org-scoped, session-required
 * Data:   maintenance_requests, contractor_updates, audit_log, communication_log
 * Notes:  updateMaintenanceStatus("work_order_sent") validates contractor, sets
 *         work_order_sent_at, generates work_order_token if absent, and emails contractor.
 *         M1 fires on insert when tenant_id is set. M5 fires additionally on severity=critical.
 *         BUILD_63 Phase 6.
 */
import { gateway } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { triageMaintenanceRequest, deriveSeverityFromTriage } from "@/lib/ai/maintenanceTriage"
import { hasFeature } from "@/lib/tier/gates"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { routeAndSend } from "@/lib/messaging/router"
import { WorkOrderDispatchEmail } from "@/lib/comms/templates/maintenance/work-order-dispatch"
import { MaintenanceLoggedEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-logged"
import { MaintenanceEmergencyEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-emergency"
import * as React from "react"

async function fireTenantCommsOnCreate(
  orgId: string,
  tenantId: string | null,
  unitId: string,
  userId: string,
  requestId: string,
  title: string,
  workOrderNumber: string,
  severity: string,
  urgencyReason: string,
  contactPhone: string | undefined,
  contactName: string | undefined,
): Promise<void> {
  if (!tenantId) return
  try {
    const service = await createServiceClient()
    const [tenantRes, unitRes, orgSettings] = await Promise.all([
      service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", tenantId).single(),
      service.from("units").select("unit_number, properties(name)").eq("id", unitId).single(),
      fetchOrgSettings(orgId),
    ])
    const tenant = tenantRes.data
    const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
    if (!tenant?.email) return

    const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
    const senderName = orgSettings?.name ?? "Pleks"
    const branding = buildBranding(orgSettings)

    await routeAndSend({
      orgId,
      tenantId,
      templateKey: "maintenance.logged_tenant",
      to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
      subject: `Maintenance request received — ref ${workOrderNumber}`,
      emailElement: React.createElement(MaintenanceLoggedEmail, {
        branding, tenantName, propertyLabel, requestTitle: title, workOrderNumber, senderName,
      }),
      entityType: "maintenance_request",
      entityId: requestId,
      triggeredBy: userId,
      triggerEventType: "maintenance_state",
      triggerEventId: requestId,
      toneVariant: "n/a",
    })

    if (severity === "critical") {
      await routeAndSend({
        orgId,
        tenantId,
        templateKey: "maintenance.emergency",
        to: { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
        subject: `URGENT: Critical maintenance issue at ${propertyLabel}`,
        emailElement: React.createElement(MaintenanceEmergencyEmail, {
          branding, tenantName, propertyLabel, requestTitle: title,
          urgencyReason, contactName, contactPhone, senderName,
        }),
        smsBody: `URGENT: Critical maintenance issue at ${propertyLabel}: ${title}. Contact ${contactPhone ?? senderName} immediately.`,
        entityType: "maintenance_request",
        entityId: requestId,
        triggeredBy: userId,
        triggerEventType: "maintenance_state",
        triggerEventId: requestId,
        toneVariant: "n/a",
      })
    }
  } catch {
    // Comms non-fatal
  }
}

export async function createMaintenanceRequest(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const unitId = formData.get("unit_id") as string
  const propertyId = formData.get("property_id") as string
  const buildingId = (formData.get("building_id") as string) || null
  const tenantId = formData.get("tenant_id") as string || null
  const leaseId = formData.get("lease_id") as string || null
  const contractorId = formData.get("contractor_id") as string || null
  const categoryOverride = formData.get("category_override") as string || null
  const urgencyOverride = formData.get("urgency_override") as string || null

  // Fetch building maintenance_rhythm to inform SLA notes
  let buildingRhythm: string | null = null
  if (buildingId) {
    const { data: bld } = await db
      .from("buildings")
      .select("maintenance_rhythm, heritage_pre_approval_required, heritage_approved_contractors_only")
      .eq("id", buildingId)
      .single()
    buildingRhythm = bld?.maintenance_rhythm ?? null
    // Warn on heritage pre-approval requirement in special_instructions
    if (bld?.heritage_pre_approval_required) {
      const existing = (formData.get("special_instructions") as string) || ""
      const note = "[Heritage building] Pre-approval from heritage authority required before dispatching work."
      formData.set("special_instructions", existing ? `${existing}\n${note}` : note)
    }
    if (bld?.heritage_approved_contractors_only) {
      const existing = (formData.get("special_instructions") as string) || ""
      const note = "[Heritage building] Use approved heritage contractors only."
      formData.set("special_instructions", existing ? `${existing}\n${note}` : note)
    }
  }

  // AI triage — only for Steward+ (Owner tier gets manual defaults, zero API cost)
  // If the form already ran triage client-side and agent overrode, use those values
  const tier = await getOrgTier(orgId)
  let triage: { category: string; urgency: string; urgency_reason: string; suggested_action: string; severity: "routine" | "elevated" | "urgent" | "critical"; insurance_relevant: boolean }
  if (categoryOverride) {
    const sev = deriveSeverityFromTriage(categoryOverride, urgencyOverride ?? "routine", title, description)
    triage = { category: categoryOverride, urgency: urgencyOverride ?? "routine", urgency_reason: "Agent classification", suggested_action: "", severity: sev, insurance_relevant: false }
  } else if (hasFeature(tier, "ai_maintenance_triage")) {
    triage = await triageMaintenanceRequest(title, description)
  } else {
    triage = { category: "other", urgency: "routine", urgency_reason: "Manual — upgrade for AI triage", suggested_action: "", severity: "routine", insurance_relevant: false }
  }

  // Generate work order number
  const year = new Date().getFullYear()
  const { count } = await db
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)

  const seq = ((count || 0) + 1).toString().padStart(4, "0")
  const workOrderNumber = `WO-${year}-${seq}`

  const { data: request, error } = await db
    .from("maintenance_requests")
    .insert({
      org_id: orgId,
      unit_id: unitId,
      property_id: propertyId,
      building_id: buildingId,
      lease_id: leaseId,
      tenant_id: tenantId,
      contractor_id: contractorId,
      title,
      description,
      logged_by: "agent",
      logged_by_user: userId,
      category: triage.category,
      urgency: triage.urgency,
      ai_triage_notes: buildingRhythm && buildingRhythm !== "standard"
        ? `${triage.urgency_reason} [Building rhythm: ${buildingRhythm}]`
        : triage.urgency_reason,
      ai_triage_at: new Date().toISOString(),
      work_order_number: workOrderNumber,
      access_instructions: formData.get("access_instructions") as string || null,
      special_instructions: formData.get("special_instructions") as string || null,
      contact_name: formData.get("contact_name") as string || null,
      contact_phone: formData.get("contact_phone") as string || null,
      estimated_cost_cents: formData.get("estimated_cost")
        ? Math.round(Number.parseFloat(formData.get("estimated_cost") as string) * 100)
        : null,
      severity: triage.severity,
      severity_source: categoryOverride ? "agent" : "ai_triage",
      status: "pending_review",
    })
    .select("id")
    .single()

  if (error || !request) {
    return { error: error?.message || "Failed to create request" }
  }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_requests",
    record_id: request.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { title, category: triage.category, urgency: triage.urgency, severity: triage.severity },
  })

  await fireTenantCommsOnCreate(
    orgId, tenantId, unitId, userId, request.id, title, workOrderNumber,
    triage.severity, triage.urgency_reason,
    (formData.get("contact_phone") as string) || undefined,
    (formData.get("contact_name") as string) || undefined,
  )

  revalidatePath("/maintenance")
  redirect(`/maintenance/${request.id}`)
}

export async function updateMaintenanceStatus(
  requestId: string,
  newStatus: string,
  notes?: string
): Promise<{ success: true; toast?: string } | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId } = gw

  const updates: Record<string, unknown> = { status: newStatus }
  let toastMessage: string | undefined

  if (newStatus === "approved") {
    updates.reviewed_by = userId
    updates.reviewed_at = new Date().toISOString()
  }

  if (newStatus === "completed") {
    updates.completed_at = new Date().toISOString()
    updates.agent_signoff_at = new Date().toISOString()
    updates.agent_signoff_by = userId
  }

  if (newStatus === "rejected") {
    updates.reviewed_by = userId
    updates.reviewed_at = new Date().toISOString()
    updates.rejection_reason = notes || null
  }

  if (newStatus === "work_order_sent") {
    // Fetch full request to validate contractor + get WO identifiers
    const { data: req, error: fetchErr } = await db
      .from("maintenance_requests")
      .select("contractor_id, work_order_number, work_order_token, org_id, title, urgency, unit_id, units(unit_number, properties(name))")
      .eq("id", requestId)
      .single()

    if (fetchErr || !req) return { error: "Could not load maintenance request." }
    if (!req.contractor_id) return { error: "Assign a contractor before sending the work order." }

    updates.work_order_sent_at = new Date().toISOString()

    // Generate token if this request pre-dates token support
    let token = req.work_order_token as string | null
    if (!token) {
      token = crypto.randomUUID()
      updates.work_order_token = token
    }

    // Fetch contractor details for the email
    const { data: contractor } = await db
      .from("contractors")
      .select("first_name, last_name, company_name, email, contact_id")
      .eq("id", req.contractor_id)
      .single()

    const contractorDisplayName = (contractor?.company_name as string | null)
      || [contractor?.first_name, contractor?.last_name].filter(Boolean).join(" ")
      || "Contractor"

    toastMessage = `Work order sent to ${contractorDisplayName}`

    if (contractor?.email) {
      const orgId = req.org_id as string
      const orgSettings = await fetchOrgSettings(orgId)
      const branding = buildBranding(orgSettings)

      const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
      const propertyLabel = unit?.properties.name ?? "Property"
      const unitLabel = unit?.unit_number ?? ""
      const woUrl = `${process.env.NEXT_PUBLIC_APP_URL}/wo/${req.work_order_number}?token=${token}`

      try {
        await sendEmail({
          orgId,
          templateKey: "maintenance.work_order",
          to: {
            email: contractor.email as string,
            name: contractorDisplayName,
            contactId: (contractor.contact_id as string | null) ?? undefined,
          },
          subject: `Work Order ${req.work_order_number} — ${propertyLabel}`,
          emailElement: React.createElement(WorkOrderDispatchEmail, {
            branding,
            contractorName: contractorDisplayName,
            workOrderNumber: req.work_order_number as string,
            propertyLabel,
            unitLabel,
            jobTitle: req.title as string,
            urgency: (req.urgency as string | null) ?? "routine",
            woUrl,
            senderName: orgSettings?.name ?? "Pleks",
          }),
          entityType: "maintenance_request",
          entityId: requestId,
          triggeredBy: userId,
          triggerEventType: "manual",
          toneVariant: "professional",
        })
      } catch {
        // Email failure is non-fatal — status still updates
      }
    }
  }

  const { error } = await db
    .from("maintenance_requests")
    .update(updates)
    .eq("id", requestId)

  if (error) return { error: error.message }

  const { data: req } = await db
    .from("maintenance_requests")
    .select("org_id")
    .eq("id", requestId)
    .single()

  if (req) {
    await db.from("audit_log").insert({
      org_id: req.org_id,
      table_name: "maintenance_requests",
      record_id: requestId,
      action: "UPDATE",
      changed_by: userId,
      new_values: updates,
    })
  }

  revalidatePath(`/maintenance/${requestId}`)
  revalidatePath("/maintenance")
  return { success: true, toast: toastMessage }
}

// ── Data-fetching server actions for the maintenance form ──────────

export async function fetchUnitsForProperty(propertyId: string) {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  const { data } = await db
    .from("units")
    .select("id, unit_number, access_instructions, prospective_tenant_id")
    .eq("property_id", propertyId)
    .eq("org_id", orgId)
    .eq("is_archived", false)
    .is("deleted_at", null)
    .order("unit_number")
  return (data ?? []) as Array<{ id: string; unit_number: string; access_instructions: string | null; prospective_tenant_id: string | null }>
}

export async function fetchTenantForUnit(
  unitId: string,
  prospectiveTenantId: string | null
): Promise<{ tenant: { id: string; name: string; phone: string | null } | null; leaseId: string | null }> {
  const gw = await gateway()
  if (!gw) return { tenant: null, leaseId: null }
  const { db } = gw
  const TENANT_STATUSES = ["draft", "pending_signing", "active", "notice", "month_to_month"]

  const { data: lease } = await db
    .from("leases")
    .select("id, tenant_id")
    .eq("unit_id", unitId)
    .in("status", TENANT_STATUSES)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lease?.tenant_id) {
    const { data: tv } = await db
      .from("tenant_view")
      .select("first_name, last_name, phone")
      .eq("id", lease.tenant_id)
      .maybeSingle()
    const name = `${tv?.first_name ?? ""} ${tv?.last_name ?? ""}`.trim()
    return {
      tenant: { id: lease.tenant_id as string, name, phone: (tv?.phone as string | null) ?? null },
      leaseId: lease.id,
    }
  }

  if (prospectiveTenantId) {
    const { data: tv } = await db
      .from("tenant_view")
      .select("first_name, last_name, phone")
      .eq("id", prospectiveTenantId)
      .maybeSingle()
    if (tv) {
      const name = `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim()
      return { tenant: { id: prospectiveTenantId, name, phone: (tv.phone as string | null) ?? null }, leaseId: null }
    }
  }

  return { tenant: null, leaseId: null }
}

export async function fetchPropertyContactsAction(propertyId: string) {
  const gw = await gateway()
  if (!gw) return []
  const { db } = gw
  const { data: prop } = await db
    .from("properties")
    .select("managing_agent_id, landlord_id")
    .eq("id", propertyId)
    .maybeSingle()
  if (!prop) return []

  const contacts: Array<{ role: string; label: string; name: string; phone: string }> = []

  if (prop.managing_agent_id) {
    const { data: profile } = await db
      .from("user_profiles")
      .select("full_name, phone")
      .eq("id", prop.managing_agent_id)
      .maybeSingle()
    if (profile?.full_name) {
      contacts.push({ role: "agent", label: `Agent \u2014 ${profile.full_name}`, name: profile.full_name as string, phone: (profile.phone as string | null) ?? "" })
    }
  }

  if (prop.landlord_id) {
    const { data: landlordRow } = await db
      .from("landlords")
      .select("contact_id")
      .eq("id", prop.landlord_id)
      .maybeSingle()
    if (landlordRow?.contact_id) {
      const { data: contact } = await db
        .from("contacts")
        .select("first_name, last_name, primary_phone")
        .eq("id", landlordRow.contact_id)
        .maybeSingle()
      if (contact) {
        const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ")
        if (name) contacts.push({ role: "landlord", label: `Landlord \u2014 ${name}`, name, phone: (contact.primary_phone as string | null) ?? "" })
      }
    }
  }

  return contacts
}
