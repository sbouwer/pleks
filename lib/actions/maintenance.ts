"use server"

/**
 * lib/actions/maintenance.ts — server actions for maintenance request lifecycle
 *
 * Auth:   requireAgentWriteAccess (writes); gateway (reads — no lockdown gate needed)
 * Data:   maintenance_requests, contractor_updates, audit_log, communication_log
 * Notes:  updateMaintenanceStatus("work_order_sent") validates contractor, sets
 *         work_order_sent_at, generates work_order_token if absent, and emails contractor.
 *         M1 fires on insert when tenant_id is set. M5 fires additionally on severity=critical.
 *         BUILD_63 Phase 6.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { gateway } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { triageMaintenanceRequest, deriveSeverityFromTriage } from "@/lib/ai/maintenanceTriage"
import { workOrderCategoryCode } from "@/lib/maintenance/categories"
import { hasFeature } from "@/lib/tier/gates"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { resolveCompanyContact } from "@/lib/contacts/resolveCompanyContact"
import { routeAndSend } from "@/lib/messaging/router"
import { WorkOrderDispatchEmail } from "@/lib/comms/templates/maintenance/work-order-dispatch"
import { MaintenanceLoggedEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-logged"
import { MaintenanceEmergencyEmail } from "@/lib/comms/templates/tenant/maintenance/maintenance-emergency"
import { CancelledContractorEmail } from "@/lib/comms/templates/maintenance/cancelled-contractor"
import { CancelledTenantEmail } from "@/lib/comms/templates/maintenance/cancelled-tenant"
import { ContractorChangedEmail } from "@/lib/comms/templates/maintenance/contractor-changed"
import { MemoLandlordNotifiedEmail } from "@/lib/comms/templates/maintenance/memo-landlord-notified"
import * as React from "react"
import { APP_URL } from "@/lib/env"

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
      templateCategory: "maintenance",
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
        smsBody: `URGENT: Critical maintenance issue at ${propertyLabel}: ${title}. Contact ${contactPhone ?? contactName ?? "our office"} immediately.`,
        entityType: "maintenance_request",
        entityId: requestId,
        triggeredBy: userId,
        triggerEventType: "maintenance_state",
        triggerEventId: requestId,
        toneVariant: "n/a",
        templateCategory: "maintenance",
      })
    }
  } catch {
    // Comms non-fatal
  }
}

export async function createMaintenanceRequest(formData: FormData) {
  const gw = await requireAgentWriteAccess("assign_maintenance")
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
    const { data: bld, error: bldError } = await db
      .from("buildings")
      .select("maintenance_rhythm, heritage_pre_approval_required, heritage_approved_contractors_only")
      .eq("id", buildingId)
      .single()
    if (bldError) console.error("createMaintenanceRequest buildings read failed:", bldError.message)
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

  // Generate work order number: WO-YYYYMM-<CAT>-NNNNN
  //   YYYYMM = creation month · CAT = 3-letter category code (workOrderCategoryCode) ·
  //   NNNNN  = per-org running counter (zero-padded to 5). Category is known at triage time,
  //   so the number is mintable at creation even before a contractor is assigned.
  const now = new Date()
  const yearMonth = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}`
  const catCode = workOrderCategoryCode(triage.category)
  const { count } = await db
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)

  const seq = ((count || 0) + 1).toString().padStart(5, "0")
  const workOrderNumber = `WO-${yearMonth}-${catCode}-${seq}`

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
      // Default-on-create = the creating agent (ADDENDUM_TEAMS D-12) → lands in their My-work.
      assigned_user_id: userId,
      assigned_at: new Date().toISOString(),
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

// ── Helper: prepare work_order_sent status transition ────────────────────────

type GatewayDb = import("@supabase/supabase-js").SupabaseClient

/**
 * 25A §3: resolve the recipient `to` for a company-addressed send — function/primary person when one
 * exists, else the contact's own email (never drops a send). Centralised so call sites stay simple.
 */
async function maintenanceRecipient(
  db: GatewayDb, orgId: string, contactId: string | null, fallbackEmail: string, fallbackName: string,
  purpose: "maintenance" | "general" = "maintenance",
): Promise<{ email: string; name: string; contactId?: string }> {
  const r = contactId ? await resolveCompanyContact(db, orgId, contactId, purpose, "email") : null
  return { email: r?.email ?? fallbackEmail, name: r?.name ?? fallbackName, contactId: r?.contactId ?? contactId ?? undefined }
}

async function prepareWorkOrderSent(
  db: GatewayDb,
  userId: string,
  requestId: string,
  orgId: string,
): Promise<{ extraUpdates: Record<string, unknown>; toastMessage: string } | { error: string }> {
  const { data: req, error: fetchErr } = await db
    .from("maintenance_requests")
    .select("contractor_id, work_order_number, work_order_token, org_id, title, urgency, unit_id, units(unit_number, properties(name))")
    .eq("id", requestId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .single()

  if (fetchErr || !req) return { error: "Could not load maintenance request." }
  if (!req.contractor_id) return { error: "Assign a contractor before sending the work order." }

  const extraUpdates: Record<string, unknown> = { work_order_sent_at: new Date().toISOString() }
  let token = req.work_order_token as string | null
  if (!token) {
    token = crypto.randomUUID()
    extraUpdates.work_order_token = token
  }

  const { data: contractor, error: contractorError } = await db
    .from("contractor_view")
    .select("first_name, last_name, company_name, email, contact_id")
    .eq("id", req.contractor_id)
    .single()
  if (contractorError) console.error("contractors read failed:", contractorError.message)

  const contractorDisplayName = (contractor?.company_name as string | null)
    || [contractor?.first_name, contractor?.last_name].filter(Boolean).join(" ")
    || "Contractor"

  // 25A §3: route the work order to the supplier's maintenance (or primary) person when one exists;
  // otherwise fall back to the contractor's own email — resolver only improves routing, never drops a send.
  const contractorContactId = (contractor?.contact_id as string | null) ?? null
  const resolved = contractorContactId
    ? await resolveCompanyContact(db, req.org_id as string, contractorContactId, "maintenance", "email")
    : null
  const recipientEmail = resolved?.email ?? (contractor?.email as string | null) ?? null
  const recipientName = resolved?.name ?? contractorDisplayName
  const recipientContactId = resolved?.contactId ?? contractorContactId ?? undefined

  if (recipientEmail) {
    await sendWorkOrderEmail({ db, userId, requestId, req, recipientEmail, recipientName, recipientContactId, contractorDisplayName, token })
  }

  return { extraUpdates, toastMessage: `Work order sent to ${contractorDisplayName}` }
}

async function sendWorkOrderEmail({ db, userId, requestId, req, recipientEmail, recipientName, recipientContactId, contractorDisplayName, token }: {
  db: GatewayDb
  userId: string
  requestId: string
  req: Record<string, unknown>
  recipientEmail: string
  recipientName: string
  recipientContactId?: string
  contractorDisplayName: string
  token: string
}) {
  const orgId = req.org_id as string
  const [orgSettings, photosRes] = await Promise.all([
    fetchOrgSettings(orgId),
    db.from("maintenance_photos")
      .select("id, storage_path, photo_phase, created_at")
      .eq("request_id", requestId)
      .eq("photo_phase", "before")
      .order("created_at"),
  ])
  const branding = buildBranding(orgSettings)
  const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
  const propertyLabel = unit?.properties.name ?? "Property"
  const unitLabel = unit?.unit_number ?? ""
  const woUrl = `${APP_URL}/wo/${req.work_order_number}?token=${token}`

  const rawPhotos = photosRes.data ?? []
  const woPhotos: Array<{ url: string; caption: string }> = []
  const service = await createServiceClient()
  for (const ph of rawPhotos.slice(0, 6)) {
    try {
      const { data: signed, error: signedError } = await service.storage
        .from("maintenance-photos")
        .createSignedUrl(ph.storage_path as string, 60 * 60 * 24 * 7)
      if (signedError) console.error("work-order photo signed-url failed:", signedError.message)
      if (signed?.signedUrl) {
        woPhotos.push({ url: signed.signedUrl, caption: `Before · ${new Date(ph.created_at as string).toLocaleDateString("en-ZA")}` })
      }
    } catch { /* skip invalid photos */ }
  }

  try {
    await sendEmail({
      orgId, templateKey: "maintenance.work_order",
      to: { email: recipientEmail, name: recipientName, contactId: recipientContactId },
      subject: `Work Order ${req.work_order_number} — ${propertyLabel}`,
      emailElement: React.createElement(WorkOrderDispatchEmail, {
        branding, contractorName: contractorDisplayName,
        workOrderNumber: req.work_order_number as string,
        propertyLabel, unitLabel, jobTitle: req.title as string,
        urgency: (req.urgency as string | null) ?? "routine",
        woUrl, senderName: orgSettings?.name ?? "Pleks",
        photos: woPhotos, additionalPhotoCount: Math.max(0, rawPhotos.length - 6),
      }),
      entityType: "maintenance_request", entityId: requestId,
      triggeredBy: userId, triggerEventType: "manual", toneVariant: "professional",
      templateCategory: "maintenance",
    })
  } catch { /* email failure is non-fatal */ }
}

export async function updateMaintenanceStatus(
  requestId: string,
  newStatus: string,
  notes?: string
): Promise<{ success: true; toast?: string } | { error: string }> {
  const gw = await requireAgentWriteAccess("assign_maintenance")
  const { db, userId, orgId } = gw

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
    const result = await prepareWorkOrderSent(db, userId, requestId, orgId)
    if ("error" in result) return result
    Object.assign(updates, result.extraUpdates)
    toastMessage = result.toastMessage
  }

  const { error } = await db
    .from("maintenance_requests")
    .update(updates)
    .eq("id", requestId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)

  if (error) return { error: error.message }

  const { data: req, error: reqError } = await db
    .from("maintenance_requests")
    .select("org_id")
    .eq("id", requestId)
    .eq("org_id", orgId)
    .single()

  if (reqError) console.error("maintenance_requests read failed:", reqError.message)
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

// read-only — no lockdown gate needed
export async function fetchUnitsForProperty(propertyId: string) {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  const { data, error } = await db
    .from("units")
    .select("id, unit_number, access_instructions, prospective_tenant_id")
    .eq("property_id", propertyId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .is("deleted_at", null)
    .order("unit_number")
  if (error) console.error("fetchUnitsForProperty failed:", error.message)
  return (data ?? []) as Array<{ id: string; unit_number: string; access_instructions: string | null; prospective_tenant_id: string | null }>
}

// read-only — no lockdown gate needed
export async function fetchTenantForUnit(
  unitId: string,
  prospectiveTenantId: string | null
): Promise<{ tenant: { id: string; name: string; phone: string | null } | null; leaseId: string | null }> {
  const gw = await gateway()
  if (!gw) return { tenant: null, leaseId: null }
  const { db, orgId } = gw
  const TENANT_STATUSES = ["draft", "pending_signing", "active", "notice", "month_to_month"]

  // Org-scope guard (caller-ID census): a foreign unitId reaches no lease/tenant of another org.
  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("id, tenant_id")
    .eq("unit_id", unitId)
    .eq("org_id", orgId)
    .in("status", TENANT_STATUSES)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (leaseError) console.error("fetchTenantForUnit leases read failed:", leaseError.message)
  if (lease?.tenant_id) {
    const { data: tv, error: tvError } = await db
      .from("tenant_view")
      .select("first_name, last_name, phone")
      .eq("id", lease.tenant_id)
      .eq("org_id", orgId)
      .maybeSingle()
    if (tvError) console.error("fetchTenantForUnit tenant_view (lease) read failed:", tvError.message)
    const name = `${tv?.first_name ?? ""} ${tv?.last_name ?? ""}`.trim()
    return {
      tenant: { id: lease.tenant_id as string, name, phone: (tv?.phone as string | null) ?? null },
      leaseId: lease.id,
    }
  }

  if (prospectiveTenantId) {
    const { data: tv, error: tvError } = await db
      .from("tenant_view")
      .select("first_name, last_name, phone")
      .eq("id", prospectiveTenantId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (tvError) console.error("fetchTenantForUnit tenant_view (prospective) read failed:", tvError.message)
    if (tv) {
      const name = `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim()
      return { tenant: { id: prospectiveTenantId, name, phone: (tv.phone as string | null) ?? null }, leaseId: null }
    }
  }

  return { tenant: null, leaseId: null }
}

// read-only — no lockdown gate needed
export async function fetchPropertyContactsAction(propertyId: string) {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  // Org-scope guard (caller-ID census): a foreign propertyId returns no contacts.
  const { data: prop, error: propError } = await db
    .from("properties")
    .select("managing_agent_id, landlord_id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (propError) console.error("fetchPropertyContactsAction properties read failed:", propError.message)
  if (!prop) return []

  const contacts: Array<{ role: string; label: string; name: string; phone: string }> = []

  if (prop.managing_agent_id) {
    const { data: profile, error: profileError } = await db
      .from("user_profiles")
      .select("full_name, phone")
      .eq("id", prop.managing_agent_id)
      .maybeSingle()
    if (profileError) console.error("fetchPropertyContactsAction user_profiles read failed:", profileError.message)
    if (profile?.full_name) {
      contacts.push({ role: "agent", label: `Agent \u2014 ${profile.full_name}`, name: profile.full_name as string, phone: (profile.phone as string | null) ?? "" })
    }
  }

  if (prop.landlord_id) {
    const { data: landlordRow, error: landlordRowError } = await db
      .from("landlords")
      .select("contact_id")
      .eq("id", prop.landlord_id)
      .maybeSingle()
    if (landlordRowError) console.error("fetchPropertyContactsAction landlords read failed:", landlordRowError.message)
    if (landlordRow?.contact_id) {
      const { data: contact, error: contactError } = await db
        .from("contacts")
        .select("first_name, last_name, primary_phone")
        .eq("id", landlordRow.contact_id)
        .maybeSingle()
      if (contactError) console.error("fetchPropertyContactsAction contacts read failed:", contactError.message)
      if (contact) {
        const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ")
        if (name) contacts.push({ role: "landlord", label: `Landlord \u2014 ${name}`, name, phone: (contact.primary_phone as string | null) ?? "" })
      }
    }
  }

  return contacts
}

// ── ADDENDUM_45A: lifecycle hardening actions ──────────────────────────────────

const TERMINAL_STATUSES = ["completed", "closed", "cancelled", "rejected"]
const WO_TOKEN_STATUSES  = ["work_order_sent", "acknowledged", "in_progress", "pending_completion"]

// Editable-fields whitelist for updateMaintenanceRequest
type EditableFields = {
  title?: string
  description?: string
  category_override?: string | null
  urgency_override?: string | null
  access_instructions?: string | null
  special_instructions?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  estimated_cost_cents?: number | null
  scheduled_date?: string | null
  scheduled_time_from?: string | null
  scheduled_time_to?: string | null
}

export async function updateMaintenanceRequest(
  requestId: string,
  updates: EditableFields,
): Promise<{ success: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("assign_maintenance")
  const { db, userId, orgId } = gw

  const { data: existing, error: fetchErr } = await db
    .from("maintenance_requests")
    .select("status, title, description, category_override, urgency_override, access_instructions, special_instructions, contact_name, contact_phone, estimated_cost_cents, scheduled_date, scheduled_time_from, scheduled_time_to, org_id")
    .eq("id", requestId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .single()

  if (fetchErr || !existing) return { error: "Request not found" }
  if (TERMINAL_STATUSES.includes(existing.status)) {
    return { error: "Cannot edit a completed, closed, cancelled, or rejected request" }
  }

  const patch: Record<string, unknown> = {}
  const oldValues: Record<string, unknown> = {}
  const keys = Object.keys(updates) as Array<keyof EditableFields>
  for (const k of keys) {
    const incoming = updates[k]
    const current = (existing as Record<string, unknown>)[k]
    if (incoming !== current) {
      patch[k] = incoming
      oldValues[k] = current
    }
  }
  if (Object.keys(patch).length === 0) return { success: true }

  const { error } = await db.from("maintenance_requests").update(patch).eq("id", requestId).eq("org_id", orgId)
  if (error) return { error: error.message }

  await db.from("audit_log").insert({
    org_id: existing.org_id,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "UPDATE",
    changed_by: userId,
    old_values: oldValues,
    new_values: patch,
  })

  revalidatePath(`/maintenance/${requestId}`)
  return { success: true }
}

export async function addMaintenanceNote(
  requestId: string,
  note: string,
  notifyLandlord = false,
): Promise<{ success: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("assign_maintenance")
  const { db, userId, orgId } = gw

  const trimmed = note.trim()
  if (!trimmed) return { error: "Note cannot be empty" }
  if (trimmed.length > 1000) return { error: "Note exceeds 1,000 character limit" }

  const { data: profile, error: profileError } = await db.from("user_profiles").select("full_name").eq("id", userId).maybeSingle()
  if (profileError) console.error("addMaintenanceNote user_profiles read failed:", profileError.message)
  const actorName = (profile?.full_name as string | null) ?? null

  const { error: noteError } = await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "NOTE",
    changed_by: userId,
    actor_name: actorName,
    new_values: { note: trimmed, notified_landlord: notifyLandlord },
  })
  if (noteError) return { error: noteError.message }

  // Optional: notify landlord via maintenance.memo_landlord_notified
  if (notifyLandlord) {
    try {
      const service = await createServiceClient()
      const { data: req, error: reqError } = await service
        .from("maintenance_requests")
        .select("title, work_order_number, unit_id, property_id")
        .eq("id", requestId)
        .single()

      if (reqError) console.error("addMaintenanceNote maintenance_requests read failed:", reqError.message)
      if (req?.property_id) {
        const [unitRes, propRes, orgSettings] = await Promise.all([
          req.unit_id
            ? service.from("units").select("unit_number").eq("id", req.unit_id).single()
            : Promise.resolve({ data: null }),
          service.from("properties")
            .select("name, landlord_id, landlords(contact_id, contacts(primary_email, first_name, last_name))")
            .eq("id", req.property_id)
            .single(),
          fetchOrgSettings(orgId),
        ])
        const property = propRes.data as {
          name: string
          landlord_id: string | null
          landlords: { contact_id: string | null; contacts: { primary_email: string | null; first_name: string | null; last_name: string | null } | null } | null
        } | null
        const landlordContact = property?.landlords?.contacts
        const landlordEmail = landlordContact?.primary_email
        if (landlordEmail) {
          const landlordName = [landlordContact?.first_name, landlordContact?.last_name].filter(Boolean).join(" ") || "Owner"
          const propertyLabel = `${unitRes.data?.unit_number ? `Unit ${unitRes.data.unit_number}, ` : ""}${property?.name ?? ""}`
          const agentProfile = await service.from("user_profiles").select("full_name").eq("id", userId).single()
          const agentName = (agentProfile.data?.full_name as string | null) ?? "Your agent"
          await sendEmail({
            orgId,
            templateKey: "maintenance.memo_landlord_notified",
            to: await maintenanceRecipient(service, orgId, property?.landlords?.contact_id ?? null, landlordEmail, landlordName, "general"),
            subject: `Maintenance memo — ${req.work_order_number ?? requestId}`,
            emailElement: React.createElement(MemoLandlordNotifiedEmail, {
              branding: buildBranding(orgSettings),
              landlordName,
              propertyLabel,
              workOrderNumber: (req.work_order_number as string | null) ?? requestId,
              agentName,
              memoText: trimmed.length > 500 ? `${trimmed.slice(0, 497)}…` : trimmed,
              requestTitle: (req.title as string | null) ?? "Maintenance request",
              senderName: orgSettings?.name ?? "Pleks",
            }),
            entityType: "maintenance_request",
            entityId: requestId,
            triggeredBy: userId,
            triggerEventType: "manual",
            toneVariant: "professional",
            templateCategory: "maintenance",
          })
        }
      }
    } catch {
      // Landlord notify is non-fatal
    }
  }

  revalidatePath(`/maintenance/${requestId}`)
  return { success: true }
}

const VALID_CANCELLATION_CATEGORIES = [
  "tenant_withdrew", "duplicate_request", "no_longer_required",
  "contractor_unavailable", "agent_decision", "work_completed_externally",
  "wrong_property", "other",
] as const

export async function cancelMaintenanceRequest(
  requestId: string,
  reason: string,
  category: string,
): Promise<{ success: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("assign_maintenance")
  const { db, userId, orgId } = gw

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: "Cancellation reason is required" }
  if (trimmedReason.length < 10) return { error: "Provide a more specific cancellation reason (min 10 characters)" }
  if (!(VALID_CANCELLATION_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "Invalid cancellation category" }
  }

  const { data: req, error: fetchErr } = await db
    .from("maintenance_requests")
    .select("status, work_order_sent_at, contractor_id, tenant_id, logged_by, title, work_order_number, unit_id, org_id")
    .eq("id", requestId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .single()

  if (fetchErr || !req) return { error: "Request not found" }
  if (TERMINAL_STATUSES.includes(req.status)) return { error: "Request is already in a terminal state" }

  const revokeToken = WO_TOKEN_STATUSES.includes(req.status)
  const now = new Date().toISOString()

  const { error: updateErr } = await db.from("maintenance_requests").update({
    status: "cancelled",
    cancellation_reason: trimmedReason,
    cancellation_category: category,
    cancelled_at: now,
    cancelled_by: userId,
    ...(revokeToken ? { work_order_token_revoked_at: now } : {}),
  }).eq("id", requestId).eq("org_id", orgId)

  if (updateErr) return { error: updateErr.message }

  const { data: cancelProfile, error: cancelProfileError } = await db.from("user_profiles").select("full_name").eq("id", userId).maybeSingle()
  if (cancelProfileError) console.error("cancelMaintenanceRequest user_profiles read failed:", cancelProfileError.message)
  const cancelActorName = (cancelProfile?.full_name as string | null) ?? null

  await db.from("audit_log").insert([
    {
      org_id: orgId, table_name: "maintenance_requests", record_id: requestId,
      action: "UPDATE", changed_by: userId, actor_name: cancelActorName,
      new_values: { status: "cancelled", cancellation_category: category, cancellation_reason: trimmedReason },
    },
    {
      org_id: orgId, table_name: "maintenance_requests", record_id: requestId,
      action: "NOTE", changed_by: userId, actor_name: cancelActorName,
      new_values: { note: `Request cancelled: ${trimmedReason}` },
    },
  ])

  if (revokeToken && req.contractor_id) {
    void notifyCancelledContractor({ orgId, userId, requestId, req })
  }
  if (req.logged_by === "tenant" && req.tenant_id) {
    void notifyCancelledTenant({ orgId, userId, requestId, req })
  }

  revalidatePath(`/maintenance/${requestId}`)
  revalidatePath("/maintenance")
  return { success: true }
}

async function notifyCancelledContractor({ orgId, userId, requestId, req }: { orgId: string; userId: string; requestId: string; req: Record<string, unknown> }) {
  try {
    const service = await createServiceClient()
    const [contractorRes, unitRes, orgSettings] = await Promise.all([
      service.from("contractor_view").select("first_name, last_name, company_name, email, contact_id").eq("id", req.contractor_id).single(),
      req.unit_id ? service.from("units").select("unit_number, properties(name)").eq("id", req.unit_id).single() : Promise.resolve({ data: null }),
      fetchOrgSettings(orgId),
    ])
    const c = contractorRes.data
    const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
    if (!c) return
    const contractorName = (c.company_name as string | null) || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contractor"
    // 25A §3: route to the supplier's maintenance/primary person when one exists; else the contractor's own email.
    const resolved = c.contact_id ? await resolveCompanyContact(service, orgId, c.contact_id as string, "maintenance", "email") : null
    const recipientEmail = resolved?.email ?? (c.email as string | null) ?? null
    if (!recipientEmail) return
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "the property"
    await sendEmail({
      orgId, templateKey: "maintenance.cancelled",
      to: { email: recipientEmail, name: resolved?.name ?? contractorName, contactId: resolved?.contactId ?? (c.contact_id as string | null) ?? undefined },
      subject: `Work order cancelled — ${req.work_order_number ?? requestId}`,
      emailElement: React.createElement(CancelledContractorEmail, {
        branding: buildBranding(orgSettings), contractorName,
        workOrderNumber: (req.work_order_number as string | null) ?? requestId,
        requestTitle: (req.title as string | null) ?? "Maintenance request",
        propertyLabel, senderName: orgSettings?.name ?? "Pleks",
      }),
      entityType: "maintenance_request", entityId: requestId, triggeredBy: userId, triggerEventType: "manual", toneVariant: "professional",
      templateCategory: "maintenance",
    })
  } catch { /* non-fatal */ }
}

async function notifyCancelledTenant({ orgId, userId, requestId, req }: { orgId: string; userId: string; requestId: string; req: Record<string, unknown> }) {
  try {
    const service = await createServiceClient()
    const [tenantRes, unitRes, orgSettings] = await Promise.all([
      service.from("tenant_view").select("first_name, last_name, email, phone").eq("id", req.tenant_id).single(),
      req.unit_id ? service.from("units").select("unit_number, properties(name)").eq("id", req.unit_id).single() : Promise.resolve({ data: null }),
      fetchOrgSettings(orgId),
    ])
    const t = tenantRes.data
    const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
    if (!t?.email) return
    const tenantName = [t.first_name, t.last_name].filter(Boolean).join(" ") || "Tenant"
    const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "your property"
    await routeAndSend({
      orgId, tenantId: req.tenant_id as string, templateKey: "maintenance.cancelled_tenant",
      to: { email: t.email, phone: (t.phone as string | null) ?? undefined, name: tenantName },
      subject: `Maintenance request closed — ${req.work_order_number ?? requestId}`,
      emailElement: React.createElement(CancelledTenantEmail, {
        branding: buildBranding(orgSettings), tenantName, propertyLabel,
        requestTitle: (req.title as string | null) ?? "Maintenance request",
        senderName: orgSettings?.name ?? "Pleks",
      }),
      entityType: "maintenance_request", entityId: requestId, triggeredBy: userId,
      triggerEventType: "maintenance_state", triggerEventId: requestId, toneVariant: "n/a",
      templateCategory: "maintenance",
    })
  } catch { /* non-fatal */ }
}

export async function changeContractor(
  requestId: string,
  newContractorId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("assign_maintenance")
  const { db, userId, orgId } = gw

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: "Reason is required" }

  const { data: req, error: fetchErr } = await db
    .from("maintenance_requests")
    .select("status, contractor_id, title, work_order_number, unit_id, org_id, work_order_token")
    .eq("id", requestId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .single()

  if (fetchErr || !req) return { error: "Request not found" }
  if (TERMINAL_STATUSES.includes(req.status)) return { error: "Cannot reassign contractor on a terminal request" }

  // Validate new contractor belongs to org
  const { data: newC, error: newCErr } = await db
    .from("contractor_view")
    .select("id, first_name, last_name, company_name, email, contact_id")
    .eq("id", newContractorId)
    .eq("org_id", orgId)
    .single()

  if (newCErr || !newC) return { error: "Contractor not found in your organisation" }

  const wasWoSent = WO_TOKEN_STATUSES.includes(req.status)
  const now = new Date().toISOString()
  const newToken = wasWoSent ? crypto.randomUUID() : undefined

  const { error: updateErr } = await db.from("maintenance_requests").update({
    contractor_id: newContractorId,
    ...(wasWoSent ? { work_order_token_revoked_at: now, work_order_token: newToken } : {}),
  }).eq("id", requestId).eq("org_id", orgId)

  if (updateErr) return { error: updateErr.message }

  const { data: changeProfile, error: changeProfileError } = await db.from("user_profiles").select("full_name").eq("id", userId).maybeSingle()
  if (changeProfileError) console.error("changeMaintenanceContractor user_profiles read failed:", changeProfileError.message)
  const changeActorName = (changeProfile?.full_name as string | null) ?? null

  await db.from("audit_log").insert([
    {
      org_id: orgId, table_name: "maintenance_requests", record_id: requestId,
      action: "UPDATE", changed_by: userId, actor_name: changeActorName,
      old_values: { contractor_id: req.contractor_id },
      new_values: { contractor_id: newContractorId },
    },
    {
      org_id: orgId, table_name: "maintenance_requests", record_id: requestId,
      action: "NOTE", changed_by: userId, actor_name: changeActorName,
      new_values: { note: `Contractor changed: ${trimmedReason}` },
    },
  ])

  if (wasWoSent) {
    try {
      const service = await createServiceClient()
      const [oldCRes, unitRes, orgSettings] = await Promise.all([
        req.contractor_id
          ? service.from("contractor_view").select("first_name, last_name, company_name, email, contact_id").eq("id", req.contractor_id as string).single()
          : Promise.resolve({ data: null }),
        req.unit_id
          ? service.from("units").select("unit_number, properties(name)").eq("id", req.unit_id).single()
          : Promise.resolve({ data: null }),
        fetchOrgSettings(orgId),
      ])
      const oldC = oldCRes.data
      const unit = unitRes.data as { unit_number: string; properties: { name: string } } | null
      const propertyLabel = unit ? `${unit.unit_number}, ${unit.properties.name}` : "the property"
      const branding = buildBranding(orgSettings)

      // Notify old contractor their WO is revoked
      if (oldC?.email) {
        const oldContractorName = (oldC.company_name as string | null) || [oldC.first_name, oldC.last_name].filter(Boolean).join(" ") || "Contractor"
        await sendEmail({
          orgId,
          templateKey: "maintenance.contractor_changed",
          to: await maintenanceRecipient(service, orgId, (oldC.contact_id as string | null), oldC.email as string, oldContractorName),
          subject: `Work order reassigned — ${req.work_order_number ?? requestId}`,
          emailElement: React.createElement(ContractorChangedEmail, {
            branding,
            contractorName: oldContractorName,
            workOrderNumber: (req.work_order_number as string | null) ?? requestId,
            requestTitle: (req.title as string | null) ?? "Maintenance request",
            propertyLabel,
            senderName: orgSettings?.name ?? "Pleks",
          }),
          entityType: "maintenance_request",
          entityId: requestId,
          triggeredBy: userId,
          triggerEventType: "manual",
          toneVariant: "professional",
          templateCategory: "maintenance",
        })
      }

      // Send fresh WO to new contractor
      if (newC.email && newToken) {
        const newContractorName = (newC.company_name as string | null) || [newC.first_name, newC.last_name].filter(Boolean).join(" ") || "Contractor"
        const woUrl = `${APP_URL}/wo/${req.work_order_number}?token=${newToken}`
        const unitLabel = unit?.unit_number ?? ""
        await sendEmail({
          orgId,
          templateKey: "maintenance.work_order",
          to: await maintenanceRecipient(service, orgId, (newC.contact_id as string | null), newC.email as string, newContractorName),
          subject: `Work Order ${req.work_order_number} — ${propertyLabel}`,
          emailElement: React.createElement(WorkOrderDispatchEmail, {
            branding,
            contractorName: newContractorName,
            workOrderNumber: (req.work_order_number as string | null) ?? requestId,
            propertyLabel,
            unitLabel,
            jobTitle: (req.title as string | null) ?? "Maintenance request",
            urgency: "routine",
            woUrl,
            senderName: orgSettings?.name ?? "Pleks",
          }),
          entityType: "maintenance_request",
          entityId: requestId,
          triggeredBy: userId,
          triggerEventType: "manual",
          toneVariant: "professional",
          templateCategory: "maintenance",
        })
      }
    } catch {
      // Non-fatal
    }
  }

  revalidatePath(`/maintenance/${requestId}`)
  return { success: true }
}

export async function revertStatus(
  requestId: string,
  targetStatus: string,
): Promise<{ success: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("assign_maintenance")
  const { db, userId, orgId } = gw

  if (targetStatus !== "pending_review") {
    return { error: "Revert target must be pending_review" }
  }

  const { data: req, error: fetchErr } = await db
    .from("maintenance_requests")
    .select("status, reviewed_at, work_order_sent_at, org_id")
    .eq("id", requestId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .single()

  if (fetchErr || !req) return { error: "Request not found" }

  const allowedSources = ["approved", "rejected"]
  if (!allowedSources.includes(req.status)) {
    return { error: `Can only revert from 'approved' or 'rejected', not '${req.status}'` }
  }
  if (req.work_order_sent_at) {
    return { error: "Cannot revert — work order has already been sent" }
  }
  // Must be within 60 minutes of the transition
  const transitionAt = req.reviewed_at as string | null
  if (!transitionAt || Date.now() - new Date(transitionAt).getTime() > 60 * 60 * 1000) {
    return { error: "Revert window has expired (60 minutes after approval/rejection)" }
  }

  const { error } = await db.from("maintenance_requests")
    .update({ status: "pending_review", reviewed_at: null, reviewed_by: null })
    .eq("id", requestId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "UPDATE",
    changed_by: userId,
    old_values: { status: req.status },
    new_values: { status: "pending_review" },
  })

  revalidatePath(`/maintenance/${requestId}`)
  return { success: true }
}

export async function togglePhotoVisibilityToTenant(
  photoId: string,
  visible: boolean,
): Promise<{ success: true } | { error: string }> {
  const gw = await requireAgentWriteAccess("assign_maintenance")
  const { db, userId, orgId } = gw

  const { data: photo, error: fetchErr } = await db
    .from("maintenance_photos")
    .select("id, request_id")
    .eq("id", photoId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .single()

  if (fetchErr || !photo) return { error: "Photo not found" }

  const { error } = await db.from("maintenance_photos")
    .update({ visible_to_tenant: visible })
    .eq("id", photoId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_photos",
    record_id: photoId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { visible_to_tenant: visible },
  })

  revalidatePath(`/maintenance/${photo.request_id}`)
  return { success: true }
}
