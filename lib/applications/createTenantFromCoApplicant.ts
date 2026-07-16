"use server"

/**
 * lib/applications/createTenantFromCoApplicant.ts — promote a co-applicant to a tenant at account-creation (14R §4a).
 *
 * Auth:   server action — called by the co's own account-creation at completion (link-account), with the co's new
 *         auth.users id. The co becomes a tenant-in-pre-lease-state, symmetric to the primary
 *         (application_co_applicants.tenant_id → tenants.auth_user_id).
 * Data:   reads the application_co_applicants row → dedups (by auth user, then id_number_hash) → creates contact +
 *         tenant (auth_user_id set) → links application_co_applicants.tenant_id → consent + audit.
 * Notes:  the co mirror of createTenantFromApplication; the identity lives on the co row, the binding one level over
 *         (co.tenant_id, §41). Dedup reuses an existing tenant — one person, one tenant/auth user.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber, decryptDob, idNumberColumns } from "@/lib/crypto/idNumber"
import { recordAudit } from "@/lib/audit/recordAudit"
import { incompleteMandatoryColumn } from "@/lib/migration/mandatoryFields"

export async function createTenantFromCoApplicant(
  coApplicantId: string,
  authUserId: string,
): Promise<{ tenantId: string } | { error: string }> {
  // Service client: an applicant is NOT an org member, so the cookie client's RLS would block the cross-cutting
  // contact/tenant writes. Authority is the link-account route (the applicant's session + their fill token); the
  // explicit org_id (from the co row) is the boundary, same as the apply-flow routes.
  const supabase = await createServiceClient()

  const { data: co, error: coError } = await supabase
    .from("application_co_applicants")
    .select("id, org_id, first_name, last_name, applicant_email, applicant_phone, id_type, id_number, id_number_hash, date_of_birth, employer_name, stage1_consent_given_at, tenant_id")
    .eq("id", coApplicantId)
    .single()
  logQueryError("createTenantFromCoApplicant co", coError)
  if (!co) return { error: "Co-applicant not found" }

  if (co.tenant_id) return { tenantId: co.tenant_id }

  // Dedup-on-account: a tenant already bound to this auth user → reuse it.
  const { data: byAuth, error: byAuthError } = await supabase
    .from("tenants").select("id").eq("org_id", co.org_id).eq("auth_user_id", authUserId).is("deleted_at", null).maybeSingle()
  logQueryError("createTenantFromCoApplicant tenant by auth", byAuthError)
  if (byAuth) {
    await supabase.from("application_co_applicants").update({ tenant_id: byAuth.id }).eq("id", coApplicantId)
    return { tenantId: byAuth.id }
  }

  // Dedup-on-identity: an existing tenant for this person (by id_number_hash) → reuse + bind the account if unbound.
  if (co.id_number_hash) {
    const { data: existingContact, error: ecErr } = await supabase
      .from("contacts").select("id").eq("org_id", co.org_id).eq("id_number_hash", co.id_number_hash).is("deleted_at", null).maybeSingle()
    logQueryError("createTenantFromCoApplicant contacts", ecErr)
    if (existingContact) {
      const { data: existingTenant, error: etErr } = await supabase
        .from("tenants").select("id").eq("contact_id", existingContact.id).is("deleted_at", null).maybeSingle()
      logQueryError("createTenantFromCoApplicant tenants", etErr)
      if (existingTenant) {
        await supabase.from("application_co_applicants").update({ tenant_id: existingTenant.id }).eq("id", coApplicantId)
        await supabase.from("tenants").update({ auth_user_id: authUserId }).eq("id", existingTenant.id).is("auth_user_id", null)
        return { tenantId: existingTenant.id }
      }
    }
  }

  // Create contact + tenant. id_number stays ENCRYPTED into contacts (was decrypt-then-write-PLAINTEXT, like the
  // old primary path): decryptIdNumber tolerates a raw/encrypted source, idNumberColumns re-encrypts + recomputes
  // the hash. dob decrypts to a real date — contacts.date_of_birth is a `date` column, plaintext (CD 2026-07-07).
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .insert({
      org_id: co.org_id, entity_type: "individual", primary_role: "tenant",
      first_name: co.first_name, last_name: co.last_name,
      primary_email: co.applicant_email, primary_phone: co.applicant_phone,
      // 21E §1 (F1, CD walk): a promote is a live net-new tenant, but from application data that may be
      // incomplete. RELAX+flag (never hard-refuse a promote) — an incomplete conversion lands on the burn-down.
      ...incompleteMandatoryColumn("tenant", {
        first_name: co.first_name, last_name: co.last_name,
        primary_email: co.applicant_email, primary_phone: co.applicant_phone,
      }),
      id_type: co.id_type, ...idNumberColumns(decryptIdNumber(co.id_number)),
      date_of_birth: decryptDob(co.date_of_birth),
      created_by: authUserId,
    })
    .select("id").single()
  if (contactError || !contact) return { error: contactError?.message ?? "Failed to create contact" }

  const { data: tenant, error: insertError } = await supabase
    .from("tenants")
    .insert({
      org_id: co.org_id, contact_id: contact.id, auth_user_id: authUserId,
      employer_name: co.employer_name,
      popia_consent_given: true, popia_consent_given_at: co.stage1_consent_given_at,
      portal_access_enabled: false, created_by: authUserId,
    })
    .select("id").single()
  if (insertError || !tenant) return { error: insertError?.message ?? "Failed to create tenant" }

  await supabase.from("application_co_applicants").update({ tenant_id: tenant.id }).eq("id", coApplicantId)

  await supabase.from("consent_log").insert({
    org_id: co.org_id, user_id: authUserId, subject_email: co.applicant_email,
    consent_type: "data_processing", consent_version: "1.0-tenant-onboard",
    metadata: { tenant_id: tenant.id, source: "co_applicant_pipeline", co_applicant_id: coApplicantId },
  })
  await recordAudit(supabase, { orgId: co.org_id, table: "tenants", recordId: tenant.id, action: "INSERT", actorId: authUserId, after: { source: "co_applicant", co_applicant_id: coApplicantId } })

  return { tenantId: tenant.id }
}
