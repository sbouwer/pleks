/**
 * lib/popia/anonymisePlan.ts — the declarative §7 (D-5) identity-anonymise strip-set
 *
 * Auth:   data only — no DB access here. The executor (erasure.ts) applies it under service role.
 * Data:   none (pure). Encodes ADDENDUM_ARCHIVE_VS_ERASE §7 A–E + §7.1/§7.2 as reviewable data.
 * Notes:  "Complete-by-construction is the whole point" — a missed copy = PII surviving erasure.
 *         This is the single source of truth for WHICH columns get stripped for WHICH subject type;
 *         the executor never hand-codes a table. Redaction value is nullability-correct (live schema
 *         2026-06-04): a nullable column → null; a NOT-NULL text column → REDACTED token (so the strip
 *         can't violate a NOT NULL constraint). Encrypted (_enc) / hashed (_hash) variants are still
 *         personal data (D-5) and are stripped too.
 *
 *         NOT here (by design): the F protect-set (consent_log / data_subject_requests / popia_exports
 *         / tos_acceptances / audit_log — retained to prove the erasure was lawful, POPIA s17); the G
 *         likely-dead organisations.* columns (drop in D-8, never anonymise); supplier-subject tables
 *         (deferred from v1 per §7.2 — supplier erasure routes to manual admin, D-14); free-text /
 *         incidental PII (D-16 manual carve-out review, not auto-stripped).
 */

/** v1 subject types (supplier deferred — §7.2). */
export type SubjectType = "applicant" | "tenant" | "landlord"

/** Where the executor gets the value to match the subject's rows in a group. */
export type KeyFrom =
  | "contactId"      // contacts.id and child tables keyed by contact_id
  | "individualId"   // contact_employment.individual_id
  | "tenantId"       // tenants.id and tenant child tables keyed by tenant_id
  | "landlordId"     // landlords.id; properties.landlord_id (owner_* denormalisation)
  | "userId"         // auth.users id (communication_log.user_id, user_profiles.id, …)
  | "applicationId"  // applications.id and application child tables keyed by application_id

/** REDACTED token for NOT-NULL text columns (nullable columns use null instead). De-identifies
 *  without violating the constraint. Distinct, greppable, obviously-not-real. */
export const REDACTED = "[erased]"

export interface AnonymiseGroup {
  /** stable id for audit + tests */
  id: string
  table: string
  keyColumn: string
  keyFrom: KeyFrom
  appliesTo: SubjectType[]
  /** column → redaction value. null where the column is nullable; REDACTED for NOT-NULL text. */
  fields: Record<string, string | null>
}

const ALL: SubjectType[] = ["applicant", "tenant", "landlord"]

/**
 * The strip-set. Grouped by §7 section. Redaction values reflect live-schema nullability
 * (2026-06-04) — keep in sync if the schema moves (the executor re-derives nullability defensively).
 */
export const ANONYMISE_PLAN: AnonymiseGroup[] = [
  // ── §7 A — canonical identity (contacts + child tables) ──────────────────────
  {
    id: "A.contacts",
    table: "contacts",
    keyColumn: "id",
    keyFrom: "contactId",
    appliesTo: ALL,
    fields: {
      first_name: null, last_name: null, middle_names: null,
      id_number: null, id_number_hash: null, id_type: null,
      date_of_birth: null, gender: null, nationality: null,
      primary_email: null, primary_phone: null,
      company_name: null, registration_number: null, vat_number: null,
      // within-row duplicate snapshot set (the easiest miss)
      contact_first_name: null, contact_last_name: null,
      contact_id_number: null, contact_id_number_hash: null, contact_id_type: null,
      contact_email: null, contact_phone: null, contact_date_of_birth: null,
    },
  },
  { id: "A.contact_emails", table: "contact_emails", keyColumn: "contact_id", keyFrom: "contactId", appliesTo: ALL,
    fields: { email: REDACTED } },                                   // NOT NULL
  { id: "A.contact_phones", table: "contact_phones", keyColumn: "contact_id", keyFrom: "contactId", appliesTo: ALL,
    fields: { number: REDACTED } },                                  // NOT NULL (column is `number`, not `phone`)
  { id: "A.contact_addresses", table: "contact_addresses", keyColumn: "contact_id", keyFrom: "contactId", appliesTo: ALL,
    fields: { street_line1: null, street_line2: null, suburb: null, city: null, province: null, postal_code: null } },
  { id: "A.contact_bank_accounts", table: "contact_bank_accounts", keyColumn: "contact_id", keyFrom: "contactId", appliesTo: ALL,
    fields: { account_name: null, account_number: null, bank_name: null, branch_code: null } },
  { id: "A.contact_employment", table: "contact_employment", keyColumn: "individual_id", keyFrom: "individualId", appliesTo: ALL,
    fields: { work_email: null, work_phone: null } },

  // ── §7 B — role-table denormalised PII ───────────────────────────────────────
  { id: "B.tenants", table: "tenants", keyColumn: "id", keyFrom: "tenantId", appliesTo: ["tenant", "applicant"],
    fields: { employer_name: null, employer_phone: null, occupation: null } },
  { id: "B.landlords", table: "landlords", keyColumn: "id", keyFrom: "landlordId", appliesTo: ["landlord"],
    fields: { tax_number: null } },
  { id: "B.tenant_next_of_kin", table: "tenant_next_of_kin", keyColumn: "tenant_id", keyFrom: "tenantId", appliesTo: ["tenant"],
    fields: { full_name: REDACTED, phone: null, email: null } },     // full_name NOT NULL
  { id: "B.tenant_bank_accounts", table: "tenant_bank_accounts", keyColumn: "tenant_id", keyFrom: "tenantId", appliesTo: ["tenant"],
    fields: { account_holder: REDACTED, account_number: REDACTED, account_number_enc: null, account_number_hash: null, bank_name: REDACTED, branch_code: null } },

  // ── §7 C — application-stage snapshots (the danger zone) ──────────────────────
  { id: "C.applications", table: "applications", keyColumn: "id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: {
      first_name: null, last_name: null, id_number: null, id_number_hash: null, id_type: null,
      date_of_birth: null, nationality: null, passport_number: null, passport_expiry_date: null, permit_number: null,
      applicant_email: REDACTED, applicant_phone: null,             // applicant_email NOT NULL
      employer_name: null, current_landlord_name: null,
      bank_statement_holder_name_extracted: null,                   // §7.1 add — extracted holder name
    } },
  { id: "C.application_co_applicants", table: "application_co_applicants", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { first_name: null, last_name: null, id_number: null, id_number_hash: null, date_of_birth: null, employer_name: null, applicant_email: REDACTED, applicant_phone: null } },
  { id: "C.application_directors", table: "application_directors", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { first_name: REDACTED, last_name: REDACTED, id_number: null, id_number_hash: null, email: null, phone: null } },
  { id: "C.application_guarantors", table: "application_guarantors", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { first_name: REDACTED, last_name: REDACTED, id_number: null, nationality: null, email: null, phone: null } },
  { id: "C.application_tokens", table: "application_tokens", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { applicant_email: REDACTED } },                        // NOT NULL
  { id: "C.application_screening_payments", table: "application_screening_payments", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { paid_by_email: null } },

  // ── §7 D — communications & ancillary (delivery metadata retained; keys verified vs live schema) ──
  // communication_log is keyed by contact_id (NO user_id; the old stub's user_id+content were phantom).
  // Structured recipient fields are stripped here; the free-text body/body_full → D-16 manual review.
  { id: "D.communication_log", table: "communication_log", keyColumn: "contact_id", keyFrom: "contactId", appliesTo: ALL,
    fields: { recipient_name: null, sent_to_email: null, sent_to_phone: null } },
  { id: "D.communication_preferences", table: "communication_preferences", keyColumn: "contact_id", keyFrom: "contactId", appliesTo: ALL,
    fields: { email: null } },
  { id: "D.consent_verifications", table: "consent_verifications", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { target_email: null, target_phone_e164: null } },
  { id: "D.maintenance_requests", table: "maintenance_requests", keyColumn: "tenant_id", keyFrom: "tenantId", appliesTo: ["tenant"],
    fields: { contact_name: null, contact_phone: null } },
  { id: "D.document_generation_jobs", table: "document_generation_jobs", keyColumn: "user_id", keyFrom: "userId", appliesTo: ALL,
    fields: { recipient_name: null, recipient_email: null } },
  { id: "D.property_info_requests", table: "property_info_requests", keyColumn: "recipient_contact_id", keyFrom: "contactId", appliesTo: ["landlord"],
    fields: { recipient_email: null, recipient_phone: null } },

  // ── §7 E — denormalised landlord/owner PII ───────────────────────────────────
  { id: "E.properties", table: "properties", keyColumn: "landlord_id", keyFrom: "landlordId", appliesTo: ["landlord"],
    fields: { owner_name: null, owner_email: null, owner_phone: null, owner_bank_name: null, owner_tax_number: null } },
  { id: "E.user_profiles", table: "user_profiles", keyColumn: "id", keyFrom: "userId", appliesTo: ALL,
    fields: { first_name: null, last_name: null, full_name: null, mobile: null, phone: null, emergency_contact_name: null, emergency_phone: null } },
]

/** The strip-plan groups that apply to a given subject type. */
export function planForSubject(subjectType: SubjectType): AnonymiseGroup[] {
  return ANONYMISE_PLAN.filter((g) => g.appliesTo.includes(subjectType))
}
