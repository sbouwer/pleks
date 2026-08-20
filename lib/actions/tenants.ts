"use server"

/**
 * lib/actions/tenants.ts — update server actions for tenant contacts
 *
 * Auth:   requireAgentWriteAccess (all paths are writes)
 * Data:   contacts + tenants tables via gateway service client; writes contact_emails/contact_phones via
 *         syncPrimaryContactEmail/syncPrimaryContactPhone — contacts.primary_email and contacts.primary_phone
 *         are derived caches (trigger-maintained, 002_contacts.sql §22/§23) and are no longer written directly here.
 * Notes:  Tenant CREATE now goes through the shared add-party flow (addTenantParty); this file holds the
 *         post-create edit actions. updateTenant edits the contact + tenant rows. (logCommunication
 *         was removed 2026-08-20 as a dead export; nothing here writes communication_log.)
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { syncPrimaryContactEmail } from "@/lib/contacts/syncPrimaryEmail"
import { syncPrimaryContactPhone } from "@/lib/contacts/syncPrimaryPhone"

export async function updateTenant(tenantId: string, formData: FormData) {
  const gw = await requireAgentWriteAccess("edit_tenant")
  const { db, orgId } = gw

  const tenantType = formData.get("tenant_type") as string

  // First get the tenant's contact_id
  const { data: tenantRecord, error: tenantRecordError } = await db
    .from("tenants")
    .select("contact_id")
    .eq("id", tenantId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .single()
    logQueryError("updateTenant tenants", tenantRecordError)

  if (!tenantRecord) return { error: "Tenant not found" }

  // primary_email/primary_phone are derived (triggers) — captured here, kept out of contactUpdates, and
  // written only via syncPrimaryContactEmail/syncPrimaryContactPhone below (002_contacts.sql §22/§23).
  const primaryEmail = (formData.get("email") as string | null) || null
  const primaryPhone = (formData.get("phone") as string | null) || null

  // Update contact fields
  const contactUpdates: Record<string, unknown> = {
    notes: formData.get("notes") || null,
  }

  if (tenantType === "individual") {
    contactUpdates.first_name = formData.get("first_name")
    contactUpdates.last_name = formData.get("last_name")
    contactUpdates.nationality = formData.get("nationality") || "South African"
  } else {
    contactUpdates.company_name = formData.get("company_name")
    contactUpdates.contact_first_name = formData.get("contact_person")
    contactUpdates.registration_number = formData.get("company_reg_number") || null
    contactUpdates.vat_number = formData.get("vat_number") || null
  }

  const { error: contactError } = await db.from("contacts").update(contactUpdates).eq("id", tenantRecord.contact_id).eq("org_id", orgId)
  if (contactError) return { error: contactError.message }
  await syncPrimaryContactEmail(
    db, orgId, tenantRecord.contact_id as string, primaryEmail,
    tenantType === "individual" ? "personal" : "work",
  )
  await syncPrimaryContactPhone(
    db, orgId, tenantRecord.contact_id as string, primaryPhone,
    tenantType === "individual" ? "mobile" : "work",
  )

  // Update tenant-specific fields
  const tenantUpdates: Record<string, unknown> = {
    employer_name: formData.get("employer_name") || null,
    employer_phone: formData.get("employer_phone") || null,
    occupation: formData.get("occupation") || null,
    preferred_contact: formData.get("preferred_contact") || "whatsapp",
  }

  const { error } = await db.from("tenants").update(tenantUpdates).eq("id", tenantId).eq("org_id", orgId)
  if (error) return { error: error.message }

  revalidatePath(`/tenants/${tenantId}`)
  revalidatePath("/tenants")
  redirect(`/tenants/${tenantId}`)
}
