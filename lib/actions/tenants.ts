"use server"

/**
 * lib/actions/tenants.ts — update server actions for tenant contacts
 *
 * Auth:   requireAgentWriteAccess (all paths are writes)
 * Data:   contacts + tenants tables via gateway service client
 * Notes:  Tenant CREATE now goes through the shared add-party flow (addTenantParty); this file holds the
 *         post-create edit/communication actions. updateTenant edits the contact + tenant rows;
 *         logCommunication records a communication_log entry.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { hasCapability } from "@/lib/auth/can"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { logQueryError } from "@/lib/supabase/logQueryError"

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

  // Update contact fields
  const contactUpdates: Record<string, unknown> = {
    primary_email: formData.get("email") || null,
    primary_phone: formData.get("phone") || null,
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

export async function logCommunication(formData: FormData) {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "tenants"))) throw new Error("Tenants access is required")
  const { db, userId, orgId } = gw

  const { error } = await db.from("communication_log").insert({
    org_id: orgId,
    contact_id: formData.get("contact_id") as string,
    channel: formData.get("channel") as string,
    direction: formData.get("direction") as string || "internal",
    subject: formData.get("subject") as string || null,
    body: formData.get("body") as string,
    status: "logged",
    sent_by: userId,
  })

  if (error) return { error: error.message }

  const tenantId = formData.get("tenant_id") as string || formData.get("contact_id") as string
  revalidatePath(`/tenants/${tenantId}`)
  return { success: true }
}
