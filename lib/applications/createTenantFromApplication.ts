"use server"

import { createClient } from "@/lib/supabase/server"

export async function createTenantFromApplication(
  applicationId: string,
  agentId: string
): Promise<{ tenantId: string } | { error: string }> {
  const supabase = await createClient()

  const { data: application } = await supabase
    .from("applications")
    .select(`
      id, org_id, first_name, last_name, applicant_email, applicant_phone,
      id_type, id_number, id_number_hash, date_of_birth,
      employer_name, employment_type,
      stage1_consent_given_at, tenant_id,
      is_foreign_national, nationality, passport_number
    `)
    .eq("id", applicationId)
    .single()

  if (!application) return { error: "Application not found" }

  // Already linked to a tenant
  if (application.tenant_id) {
    return { tenantId: application.tenant_id }
  }

  // Deduplication — check if tenant with same ID hash already exists in org
  if (application.id_number_hash) {
    const { data: existing } = await supabase
      .from("tenants")
      .select("id")
      .eq("org_id", application.org_id)
      .eq("id_number_hash", application.id_number_hash)
      .is("deleted_at", null)
      .single()

    if (existing) {
      await supabase.from("applications")
        .update({ tenant_id: existing.id })
        .eq("id", applicationId)

      return { tenantId: existing.id }
    }
  }

  // Create new tenant
  const { data: tenant, error: insertError } = await supabase
    .from("tenants")
    .insert({
      org_id: application.org_id,
      first_name: application.first_name,
      last_name: application.last_name,
      email: application.applicant_email,
      phone: application.applicant_phone,
      id_type: application.id_type,
      id_number: application.id_number,
      id_number_hash: application.id_number_hash,
      date_of_birth: application.date_of_birth,
      employer_name: application.employer_name,
      nationality: application.nationality,
      popia_consent_given: true,
      popia_consent_given_at: application.stage1_consent_given_at,
      portal_access_enabled: false,
      created_by: agentId,
    })
    .select("id")
    .single()

  if (insertError || !tenant) {
    return { error: insertError?.message ?? "Failed to create tenant" }
  }

  // Link application to tenant
  await supabase.from("applications")
    .update({ tenant_id: tenant.id })
    .eq("id", applicationId)

  // Log consent transfer
  await supabase.from("consent_log").insert({
    org_id: application.org_id,
    subject_email: application.applicant_email,
    consent_type: "data_processing",
    consent_version: "1.0-tenant-onboard",
    metadata: {
      tenant_id: tenant.id,
      source: "application_pipeline",
      application_id: applicationId,
    },
  })

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: application.org_id,
    table_name: "tenants",
    record_id: tenant.id,
    action: "INSERT",
    changed_by: agentId,
    new_values: { source: "application", application_id: applicationId },
  })

  return { tenantId: tenant.id }
}
