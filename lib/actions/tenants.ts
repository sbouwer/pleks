"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { hashIdNumber } from "@/lib/crypto/idNumber"
import { headers } from "next/headers"

export async function createTenant(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")
  const orgId = membership.org_id

  const tenantType = formData.get("tenant_type") as string || "individual"
  const idNumber = formData.get("id_number") as string || null
  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for") || "unknown"
  const ua = headersList.get("user-agent") || ""

  const entityType = tenantType === "company" ? "organisation" : "individual"

  // Build contact record
  const contactData: Record<string, unknown> = {
    org_id: orgId,
    entity_type: entityType,
    primary_role: "tenant",
    primary_email: formData.get("email") as string || null,
    primary_phone: formData.get("phone") as string || null,
    notes: formData.get("notes") as string || null,
    created_by: user.id,
  }

  if (tenantType === "individual") {
    contactData.first_name = formData.get("first_name") as string
    contactData.last_name = formData.get("last_name") as string
    contactData.id_type = formData.get("id_type") as string || null
    contactData.id_number = idNumber
    contactData.id_number_hash = idNumber ? hashIdNumber(idNumber) : null
    contactData.date_of_birth = formData.get("date_of_birth") as string || null
    contactData.nationality = formData.get("nationality") as string || "South African"
  } else {
    contactData.company_name = formData.get("company_name") as string
    contactData.registration_number = formData.get("company_reg_number") as string || null
    contactData.vat_number = formData.get("vat_number") as string || null
    contactData.contact_first_name = formData.get("contact_person") as string || null
  }

  // Step 1: Create contact
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .insert(contactData)
    .select("id")
    .single()

  if (contactError || !contact) {
    return { error: contactError?.message || "Failed to create contact" }
  }

  // Step 2: Create tenant (thin record)
  const tenantData: Record<string, unknown> = {
    org_id: orgId,
    contact_id: contact.id,
    preferred_contact: formData.get("preferred_contact") as string || "whatsapp",
    popia_consent_given: formData.get("popia_consent") === "true",
    popia_consent_given_at: formData.get("popia_consent") === "true" ? new Date().toISOString() : null,
    created_by: user.id,
    employer_name: formData.get("employer_name") as string || null,
    employer_phone: formData.get("employer_phone") as string || null,
    occupation: formData.get("occupation") as string || null,
  }

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert(tenantData)
    .select("id")
    .single()

  if (error || !tenant) {
    return { error: error?.message || "Failed to create tenant" }
  }

  // Log POPIA consent
  if (tenantData.popia_consent_given && contactData.primary_email) {
    await supabase.from("consent_log").insert({
      org_id: orgId,
      user_id: user.id,
      subject_email: contactData.primary_email as string,
      consent_type: "data_processing",
      consent_given: true,
      consent_version: "1.0-tenant-onboard",
      ip_address: ip,
      user_agent: ua,
      metadata: {
        tenant_id: tenant.id,
        agent_confirmed: true,
        tenant_type: tenantType,
      },
    })
  }

  // Emergency contacts
  const contactNames = formData.getAll("contact_name") as string[]
  const contactPhones = formData.getAll("contact_phone") as string[]
  const contactRelations = formData.getAll("contact_relationship") as string[]

  for (let i = 0; i < contactNames.length; i++) {
    if (!contactNames[i]?.trim()) continue
    await supabase.from("tenant_next_of_kin").insert({
      org_id: orgId,
      tenant_id: tenant.id,
      full_name: contactNames[i].trim(),
      phone: contactPhones[i]?.trim() || null,
      relationship: contactRelations[i]?.trim() || null,
      is_emergency: true,
    })
  }

  // Audit
  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "tenants",
    record_id: tenant.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: {
      tenant_type: tenantType,
      name: tenantType === "individual"
        ? `${contactData.first_name} ${contactData.last_name}`
        : contactData.company_name,
    },
  })

  revalidatePath("/tenants")
  redirect(`/tenants/${tenant.id}`)
}

export async function updateTenant(tenantId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const tenantType = formData.get("tenant_type") as string

  // First get the tenant's contact_id
  const { data: tenantRecord } = await supabase
    .from("tenants")
    .select("contact_id")
    .eq("id", tenantId)
    .single()

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

  const { error: contactError } = await supabase.from("contacts").update(contactUpdates).eq("id", tenantRecord.contact_id)
  if (contactError) return { error: contactError.message }

  // Update tenant-specific fields
  const tenantUpdates: Record<string, unknown> = {
    employer_name: formData.get("employer_name") || null,
    employer_phone: formData.get("employer_phone") || null,
    occupation: formData.get("occupation") || null,
    preferred_contact: formData.get("preferred_contact") || "whatsapp",
  }

  const { error } = await supabase.from("tenants").update(tenantUpdates).eq("id", tenantId)
  if (error) return { error: error.message }

  revalidatePath(`/tenants/${tenantId}`)
  revalidatePath("/tenants")
  redirect(`/tenants/${tenantId}`)
}

export async function logCommunication(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return { error: "No org" }

  const { error } = await supabase.from("communication_log").insert({
    org_id: membership.org_id,
    contact_id: formData.get("contact_id") as string,
    channel: formData.get("channel") as string,
    direction: formData.get("direction") as string || "internal",
    subject: formData.get("subject") as string || null,
    body: formData.get("body") as string,
    status: "logged",
    sent_by: user.id,
  })

  if (error) return { error: error.message }

  const tenantId = formData.get("tenant_id") as string || formData.get("contact_id") as string
  revalidatePath(`/tenants/${tenantId}`)
  return { success: true }
}
