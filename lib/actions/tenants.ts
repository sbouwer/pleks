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

  const tenantData: Record<string, unknown> = {
    org_id: orgId,
    tenant_type: tenantType,
    email: formData.get("email") as string || null,
    phone: formData.get("phone") as string || null,
    phone_alt: formData.get("phone_alt") as string || null,
    preferred_contact: formData.get("preferred_contact") as string || "whatsapp",
    notes: formData.get("notes") as string || null,
    popia_consent_given: formData.get("popia_consent") === "true",
    popia_consent_given_at: formData.get("popia_consent") === "true" ? new Date().toISOString() : null,
    created_by: user.id,
  }

  if (tenantType === "individual") {
    tenantData.first_name = formData.get("first_name") as string
    tenantData.last_name = formData.get("last_name") as string
    tenantData.id_type = formData.get("id_type") as string || null
    tenantData.id_number = idNumber
    tenantData.id_number_hash = idNumber ? hashIdNumber(idNumber) : null
    tenantData.date_of_birth = formData.get("date_of_birth") as string || null
    tenantData.nationality = formData.get("nationality") as string || "South African"
  } else {
    tenantData.company_name = formData.get("company_name") as string
    tenantData.company_reg_number = formData.get("company_reg_number") as string || null
    tenantData.vat_number = formData.get("vat_number") as string || null
    tenantData.contact_person = formData.get("contact_person") as string
  }

  // Employment
  tenantData.employer_name = formData.get("employer_name") as string || null
  tenantData.employer_phone = formData.get("employer_phone") as string || null
  tenantData.occupation = formData.get("occupation") as string || null

  // Address
  tenantData.current_address = formData.get("current_address") as string || null
  tenantData.current_city = formData.get("current_city") as string || null
  tenantData.current_province = formData.get("current_province") as string || null

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert(tenantData)
    .select("id")
    .single()

  if (error || !tenant) {
    return { error: error?.message || "Failed to create tenant" }
  }

  // Log POPIA consent
  if (tenantData.popia_consent_given) {
    await supabase.from("consent_log").insert({
      org_id: orgId,
      user_id: user.id,
      subject_email: tenantData.email as string,
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
    await supabase.from("tenant_contacts").insert({
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
        ? `${tenantData.first_name} ${tenantData.last_name}`
        : tenantData.company_name,
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
  const updates: Record<string, unknown> = {
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    phone_alt: formData.get("phone_alt") || null,
    preferred_contact: formData.get("preferred_contact") || "whatsapp",
    notes: formData.get("notes") || null,
    employer_name: formData.get("employer_name") || null,
    employer_phone: formData.get("employer_phone") || null,
    occupation: formData.get("occupation") || null,
    current_address: formData.get("current_address") || null,
    current_city: formData.get("current_city") || null,
    current_province: formData.get("current_province") || null,
  }

  if (tenantType === "individual") {
    updates.first_name = formData.get("first_name")
    updates.last_name = formData.get("last_name")
    updates.nationality = formData.get("nationality") || "South African"
  } else {
    updates.company_name = formData.get("company_name")
    updates.contact_person = formData.get("contact_person")
    updates.company_reg_number = formData.get("company_reg_number") || null
    updates.vat_number = formData.get("vat_number") || null
  }

  const { error } = await supabase.from("tenants").update(updates).eq("id", tenantId)
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
    tenant_id: formData.get("tenant_id") as string,
    channel: formData.get("channel") as string,
    direction: formData.get("direction") as string || "internal",
    subject: formData.get("subject") as string || null,
    body: formData.get("body") as string,
    status: "logged",
    sent_by: user.id,
  })

  if (error) return { error: error.message }

  const tenantId = formData.get("tenant_id") as string
  revalidatePath(`/tenants/${tenantId}`)
  return { success: true }
}
