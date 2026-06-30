"use server"

/**
 * lib/applications/createTenantFromApplication.ts — promote an application's applicant to a tenant record.
 *
 * Auth:   server action — called by the agent (shortlist/approve, createdBy=createdBy, authUserId null), and (14R)
 *         by the applicant's own account-creation at completion (createdBy + authUserId = the new auth user).
 * Data:   reads applications (denormalised applicant fields) → dedups → creates contacts + tenants → links
 *         applications.tenant_id → logs consent + audit.
 * Notes:  applicant ≡ tenant (CLAUDE.md). 14R: sets tenants.auth_user_id when the applicant creates an account at
 *         completion (binding the person to their tenant); agent-initiated leaves it null until the applicant logs
 *         in. Dedup-on-identity reuses an existing tenant by auth user OR id_number_hash — one person, one
 *         tenant/auth user; a returning person's account binds to their existing (agent-created) tenant.
 */
import { createClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber, decryptDob } from "@/lib/crypto/idNumber"

export async function createTenantFromApplication(
  applicationId: string,
  createdBy: string | null,
  // 14R: the applicant's auth.users id when they create their account at completion → set on the tenant. null for
  // agent-initiated promotion (the tenant gets no auth binding until the applicant logs in).
  authUserId: string | null = null,
): Promise<{ tenantId: string } | { error: string }> {
  const supabase = await createClient()

  const { data: application, error: applicationError } = await supabase
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
    logQueryError("createTenantFromApplication applications", applicationError)

  if (!application) return { error: "Application not found" }

  // Already linked to a tenant
  if (application.tenant_id) {
    return { tenantId: application.tenant_id }
  }

  // 14R dedup-on-account: a tenant already bound to this auth user (a returning account-holder applying again) →
  // reuse it, never mint a second tenant per person.
  if (authUserId) {
    const { data: byAuth, error: byAuthError } = await supabase
      .from("tenants").select("id").eq("org_id", application.org_id).eq("auth_user_id", authUserId).is("deleted_at", null).maybeSingle()
    logQueryError("createTenantFromApplication tenant by auth", byAuthError)
    if (byAuth) {
      await supabase.from("applications").update({ tenant_id: byAuth.id }).eq("id", applicationId)
      return { tenantId: byAuth.id }
    }
  }

  // Deduplication — check if contact with same ID hash already exists in org
  if (application.id_number_hash) {
    const { data: existingContact, error: existingContactError } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", application.org_id)
      .eq("id_number_hash", application.id_number_hash)
      .is("deleted_at", null)
      .single()
    logQueryError("createTenantFromApplication contacts", existingContactError)

    if (existingContact) {
      // Find the tenant linked to this contact
      const { data: existingTenant, error: existingTenantError } = await supabase
        .from("tenants")
        .select("id")
        .eq("contact_id", existingContact.id)
        .is("deleted_at", null)
        .single()
        logQueryError("createTenantFromApplication tenants", existingTenantError)

      if (existingTenant) {
        await supabase.from("applications")
          .update({ tenant_id: existingTenant.id })
          .eq("id", applicationId)
        // 14R: bind the applicant's new account to their existing (agent-created, unbound) tenant — only if unbound,
        // never overwrite a different auth user.
        if (authUserId) {
          await supabase.from("tenants").update({ auth_user_id: authUserId }).eq("id", existingTenant.id).is("auth_user_id", null)
        }
        return { tenantId: existingTenant.id }
      }
    }
  }

  // Create contact first
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .insert({
      org_id: application.org_id,
      entity_type: "individual",
      primary_role: "tenant",
      first_name: application.first_name,
      last_name: application.last_name,
      primary_email: application.applicant_email,
      primary_phone: application.applicant_phone,
      id_type: application.id_type,
      // Decrypt before copying to the tenant — the tenant table stores id_number raw (its display reads it raw);
      // the hash carries over unchanged. (Tenant-side at-rest encryption is a separate, broader item.)
      id_number: decryptIdNumber(application.id_number),
      id_number_hash: application.id_number_hash,
      date_of_birth: decryptDob(application.date_of_birth), // tenant.date_of_birth is a date column → store decrypted
      nationality: application.nationality,
      created_by: createdBy,
    })
    .select("id")
    .single()

  if (contactError || !contact) {
    return { error: contactError?.message ?? "Failed to create contact" }
  }

  // Create thin tenant record
  const { data: tenant, error: insertError } = await supabase
    .from("tenants")
    .insert({
      org_id: application.org_id,
      contact_id: contact.id,
      auth_user_id: authUserId, // 14R: the applicant's account at completion (null for agent-initiated promotion)
      employer_name: application.employer_name,
      popia_consent_given: true,
      popia_consent_given_at: application.stage1_consent_given_at,
      portal_access_enabled: false,
      created_by: createdBy,
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
    changed_by: createdBy,
    new_values: { source: "application", application_id: applicationId },
  })

  return { tenantId: tenant.id }
}
