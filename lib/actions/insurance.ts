"use server"

/**
 * lib/actions/insurance.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createPropertyInfoRequest } from "@/lib/actions/propertyInfoRequests"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function saveInsurancePolicy(propertyId: string, formData: FormData) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId, userId } = gw

  const replacementRaw = formData.get("insurance_replacement_value") as string | null
  const excessRaw = formData.get("insurance_excess") as string | null

  const updates = {
    insurance_policy_number:        (formData.get("insurance_policy_number") as string) || null,
    insurance_provider:             (formData.get("insurance_provider") as string) || null,
    insurance_policy_type:          (formData.get("insurance_policy_type") as string) || null,
    insurance_renewal_date:         (formData.get("insurance_renewal_date") as string) || null,
    insurance_replacement_value_cents: replacementRaw?.trim()
      ? Math.round(Number.parseFloat(replacementRaw) * 100)
      : null,
    insurance_excess_cents: excessRaw?.trim()
      ? Math.round(Number.parseFloat(excessRaw) * 100)
      : null,
    insurance_notes: (formData.get("insurance_notes") as string) || null,
  }

  const { error } = await db
    .from("properties")
    .update(updates)
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "properties",
    record_id: propertyId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { ...updates, _section: "insurance_policy" },
  })

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}

// ── Ask owner to verify checklist items ──────────────────────────────────────

export interface CreateChecklistOwnerRequestParams {
  propertyId: string
  itemCodes:  string[]
}

export async function createInsuranceChecklistOwnerRequest(
  params: CreateChecklistOwnerRequestParams,
): Promise<{ ok: boolean; requestId?: string; error?: string }> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId, userId } = gw

  if (params.itemCodes.length === 0) return { ok: false, error: "No items selected" }

  // Resolve property → landlord → contact email
  const { data: prop, error: propErr } = await db
    .from("properties")
    .select("landlord_id, owner_email")
    .eq("id", params.propertyId)
    .eq("org_id", orgId)
    .single()

  if (propErr || !prop) return { ok: false, error: "Property not found" }

  let recipientEmail: string | null = null
  let ownerName: string | undefined

  if (prop.landlord_id) {
    const service = await createServiceClient()
    const { data: landlordRow, error: landlordRowError } = await service
      .from("landlords")
      .select("contact_id")
      .eq("id", prop.landlord_id)
      .maybeSingle()
    logQueryError("createInsuranceChecklistOwnerRequest landlords", landlordRowError)

    if (landlordRow?.contact_id) {
      const { data: contact, error: contactError } = await service
        .from("contacts")
        .select("first_name, last_name, primary_email")
        .eq("id", landlordRow.contact_id as string)
        .maybeSingle()
        logQueryError("createInsuranceChecklistOwnerRequest contacts", contactError)

      if (contact) {
        recipientEmail = (contact.primary_email as string | null) ?? null
        const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ")
        if (fullName) ownerName = fullName
      }
    }
  }

  if (!recipientEmail) {
    recipientEmail = (prop.owner_email as string | null) ?? null
  }

  if (!recipientEmail) return { ok: false, error: "No owner email on record" }

  // Fetch item defs from catalogue
  const service = await createServiceClient()
  const { data: items, error: itemErr } = await service
    .from("insurance_checklist_items")
    .select("code, label, description, help_text")
    .in("code", params.itemCodes)

  if (itemErr || !items?.length) return { ok: false, error: "Could not load checklist items" }

  const checklistItems = items.map((r) => ({
    code:        r.code as string,
    label:       r.label as string,
    description: r.description as string,
    help_text:   (r.help_text as string | null) ?? null,
  }))

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 14)

  const result = await createPropertyInfoRequest({
    propertyId:     params.propertyId,
    topic:          "insurance",
    missingFields:  params.itemCodes,
    recipientType:  "owner",
    recipientEmail,
    scenarioContext: { checklist_items: checklistItems },
    checklistMode:  true,
    requestedBy:    userId,
    orgId,
    expiresAt:      expiresAt.toISOString(),
    ...(ownerName ? { ownerName } : {}),
  })

  return result
}

export async function saveBroker(propertyId: string, formData: FormData) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId } = gw

  const brokerContactId = (formData.get("broker_contact_id") as string) || null

  if (!brokerContactId) {
    const { error } = await db
      .from("property_brokers")
      .delete()
      .eq("property_id", propertyId)
    if (error) return { error: error.message }
  } else {
    const notifyChannelsRaw = formData.getAll("notify_channels") as string[]
    const notifyChannels = notifyChannelsRaw.length > 0 ? notifyChannelsRaw : ["email"]

    const { error } = await db
      .from("property_brokers")
      .upsert({
        property_id:           propertyId,
        org_id:                orgId,
        broker_contact_id:     brokerContactId,
        auto_notify_critical:  formData.get("auto_notify_critical") === "true",
        notify_channels:       notifyChannels,
        after_hours_number:    (formData.get("after_hours_number") as string) || null,
        notes:                 (formData.get("broker_notes") as string) || null,
      })
    if (error) return { error: error.message }
  }

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}
