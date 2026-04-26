"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { getTenantSession } from "@/lib/portal/getTenantSession"

interface UpdateContactPayload {
  contactId: string
  orgId: string
  phone: string | null
  email: string | null
  primaryPhoneId: string | null
  primaryEmailId: string | null
}

export async function updatePortalContactDetails(payload: UpdateContactPayload) {
  const session = await getTenantSession()
  if (!session) return { error: "Not authenticated" }

  // Verify the contactId belongs to this tenant's session
  if (payload.orgId !== session.orgId) return { error: "Unauthorised" }

  const service = await createServiceClient()

  // Verify the contact belongs to the tenant in this org
  const { data: tenant, error: tenantErr } = await service
    .from("tenants")
    .select("contact_id")
    .eq("id", session.tenantId)
    .eq("org_id", session.orgId)
    .single()

  if (tenantErr || !tenant || tenant.contact_id !== payload.contactId) {
    return { error: "Unauthorised" }
  }

  // Update phone
  if (payload.phone !== null) {
    if (payload.primaryPhoneId) {
      await service.from("contact_phones")
        .update({ number: payload.phone })
        .eq("id", payload.primaryPhoneId)
    } else {
      await service.from("contact_phones").insert({
        contact_id: payload.contactId,
        number: payload.phone,
        phone_type: "mobile",
        is_primary: true,
        can_whatsapp: true,
      })
    }
  }

  // Update email
  if (payload.email !== null) {
    if (payload.primaryEmailId) {
      await service.from("contact_emails")
        .update({ email: payload.email })
        .eq("id", payload.primaryEmailId)
    } else {
      await service.from("contact_emails").insert({
        contact_id: payload.contactId,
        email: payload.email,
        email_type: "personal",
        is_primary: true,
      })
    }
  }

  // Audit log
  await service.from("audit_log").insert({
    org_id: session.orgId,
    table_name: "contacts",
    record_id: payload.contactId,
    action: "UPDATE",
    changed_by: session.tenantId,
    new_values: {
      action: "tenant_portal_contact_update",
      fields_changed: [payload.phone !== null && "phone", payload.email !== null && "email"].filter(Boolean),
    },
  })

  return { success: true }
}
