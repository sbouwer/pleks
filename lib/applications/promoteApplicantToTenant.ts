/**
 * lib/applications/promoteApplicantToTenant.ts — applicant→tenant promotion CORE (auth-context-agnostic, 14R).
 *
 * Auth:   the CALLER supplies the Supabase client so this never hardcodes its auth context: the agent path passes
 *         its cookie/RLS client (via the createTenantFromApplication "use server" wrapper); the applicant's
 *         link-account route passes a SERVICE client (an applicant is not an org member, so cookie-RLS would block
 *         the cross-cutting writes).
 * Data:   reads applications by id → dedups (by auth user, then id_number_hash) → creates contacts + tenants →
 *         links applications.tenant_id → consent + audit.
 * Notes:  SAFE under the service client BY CONSTRUCTION — single-application-scoped (reads by applicationId, writes
 *         with the row's own org_id, no cross-org queries), and the applicant path only ever reaches it through
 *         resolveApplicationCredential's IDOR guard (never a raw id). 14R: sets tenants.auth_user_id at the
 *         applicant's account-creation; dedup-on-identity reuses an existing tenant — one person, one tenant/auth user.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber, decryptDob } from "@/lib/crypto/idNumber"

export async function promoteApplicationToTenant(
  db: SupabaseClient,
  applicationId: string,
  createdBy: string | null,
  authUserId: string | null = null,
): Promise<{ tenantId: string } | { error: string }> {
  const { data: application, error: applicationError } = await db
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
  logQueryError("promoteApplicationToTenant applications", applicationError)

  if (!application) return { error: "Application not found" }
  if (application.tenant_id) return { tenantId: application.tenant_id }

  // 14R dedup-on-account: a tenant already bound to this auth user (a returning account-holder) → reuse it.
  if (authUserId) {
    const { data: byAuth, error: byAuthError } = await db
      .from("tenants").select("id").eq("org_id", application.org_id).eq("auth_user_id", authUserId).is("deleted_at", null).maybeSingle()
    logQueryError("promoteApplicationToTenant tenant by auth", byAuthError)
    if (byAuth) {
      await db.from("applications").update({ tenant_id: byAuth.id }).eq("id", applicationId)
      return { tenantId: byAuth.id }
    }
  }

  // Dedup-on-identity by id_number_hash → existing contact → existing tenant.
  if (application.id_number_hash) {
    const { data: existingContact, error: existingContactError } = await db
      .from("contacts").select("id").eq("org_id", application.org_id).eq("id_number_hash", application.id_number_hash).is("deleted_at", null).maybeSingle()
    logQueryError("promoteApplicationToTenant contacts", existingContactError)
    if (existingContact) {
      const { data: existingTenant, error: existingTenantError } = await db
        .from("tenants").select("id").eq("contact_id", existingContact.id).is("deleted_at", null).maybeSingle()
      logQueryError("promoteApplicationToTenant tenants", existingTenantError)
      if (existingTenant) {
        await db.from("applications").update({ tenant_id: existingTenant.id }).eq("id", applicationId)
        // Bind the applicant's new account to their existing (agent-created, unbound) tenant — only if unbound.
        if (authUserId) {
          await db.from("tenants").update({ auth_user_id: authUserId }).eq("id", existingTenant.id).is("auth_user_id", null)
        }
        return { tenantId: existingTenant.id }
      }
    }
  }

  // Create contact (decrypt id/dob before copy — the tenant table stores them raw; the hash carries over).
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .insert({
      org_id: application.org_id, entity_type: "individual", primary_role: "tenant",
      first_name: application.first_name, last_name: application.last_name,
      primary_email: application.applicant_email, primary_phone: application.applicant_phone,
      id_type: application.id_type,
      id_number: decryptIdNumber(application.id_number), id_number_hash: application.id_number_hash,
      date_of_birth: decryptDob(application.date_of_birth),
      nationality: application.nationality, created_by: createdBy,
    })
    .select("id").single()
  if (contactError || !contact) return { error: contactError?.message ?? "Failed to create contact" }

  const { data: tenant, error: insertError } = await db
    .from("tenants")
    .insert({
      org_id: application.org_id, contact_id: contact.id, auth_user_id: authUserId,
      employer_name: application.employer_name,
      popia_consent_given: true, popia_consent_given_at: application.stage1_consent_given_at,
      portal_access_enabled: false, created_by: createdBy,
    })
    .select("id").single()
  if (insertError || !tenant) return { error: insertError?.message ?? "Failed to create tenant" }

  await db.from("applications").update({ tenant_id: tenant.id }).eq("id", applicationId)

  await db.from("consent_log").insert({
    org_id: application.org_id, user_id: authUserId, subject_email: application.applicant_email,
    consent_type: "data_processing", consent_version: "1.0-tenant-onboard",
    metadata: { tenant_id: tenant.id, source: "application_pipeline", application_id: applicationId },
  })
  await db.from("audit_log").insert({
    org_id: application.org_id, table_name: "tenants", record_id: tenant.id, action: "INSERT",
    changed_by: createdBy, new_values: { source: "application", application_id: applicationId },
  })

  return { tenantId: tenant.id }
}
