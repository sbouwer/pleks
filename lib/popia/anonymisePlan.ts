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
 *         organisations.* principal/sole-prop PII (id_number, date_of_birth, gender, mobile, emergency_*,
 *         addr2_*, lease_* — VERIFIED 2026-06-12 to be the LIVE "Organisation Details" settings feature
 *         (settings/details form + api/org/details ALL_FIELDS allowlist + reportBranding), NOT dead legacy.
 *         They are account-holder PII (the Responsible Party's own identity), not data-subject PII — outside erasure
 *         scope, so never anonymised and NEVER dropped (dropping 42703-breaks the org-details save). Classified
 *         ACCOUNTABILITY in the PII ratchet (CD 2026-07-07); the required retention endpoint is an account-closure
 *         erasure path (tracked follow-up — accountability must not silently become "retained forever", s14));
 *         supplier-subject tables
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
 * (2026-06-04) — keep in sync if the schema moves; as a backstop the executor coerces a plan `null`
 * to REDACTED on a NOT-NULL violation at write time (anonymiseIdentity.ts stripGroup, R-4).
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
  { id: "B.inspections", table: "inspections", keyColumn: "tenant_id", keyFrom: "tenantId", appliesTo: ["tenant"],
    fields: { tenant_signature_url: null } },                          // defensive — column is currently UNWRITTEN (e-sign feature not built), so no Storage blob to purge; covered if/when populated

  // ── §7 C — application-stage snapshots (the danger zone) ──────────────────────
  { id: "C.applications", table: "applications", keyColumn: "id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: {
      first_name: null, last_name: null, id_number: null, id_number_hash: null, id_type: null,
      date_of_birth: null, nationality: null, passport_number: null, passport_expiry_date: null, permit_number: null,
      applicant_email: REDACTED, applicant_phone: null,             // applicant_email NOT NULL
      employer_name: null, current_landlord_name: null,
      bank_statement_path: null, bank_statement_extracted: null,    // 70H F3 add — raw Stage-1 statement file path (Storage purged file-then-redact) + extracted txn JSON
      bank_statement_holder_name_extracted: null,                   // §7.1 add — extracted holder name
      searchworx_extracted_data: null,                              // 70H F3 add — raw bureau payload (JSONB)
      fitscore_narrative: null, fitscore_material_flags: null,      // P-1 — derived AI PII (income/affordability/risk), JSONB
      fitscore_components: null, fitscore_component_snapshot: null, // 70H F3 add — per-component score breakdown + frozen snapshot (JSONB)
      gross_monthly_income_cents: null, verified_monthly_income_cents: null, // applicant financial PII (PII ratchet)
    } },
  // keyColumn is primary_application_id (NOT application_id — that column does not exist on this table; the
  // prior plan value 42703'd → co-applicant PII silently survived erasure. Caught by the 70H F3 review.)
  { id: "C.application_co_applicants", table: "application_co_applicants", keyColumn: "primary_application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { first_name: null, last_name: null, id_number: null, id_number_hash: null, id_type: null, date_of_birth: null,
      employer_name: null, gross_monthly_income_cents: null, verified_monthly_income_cents: null, applicant_email: REDACTED, applicant_phone: null,
      bank_statement_path: null, bank_statement_extracted: null, searchworx_extracted_data: null } }, // 70H F3 add — co-applicants carry their own statement + bureau payload
  { id: "C.application_directors", table: "application_directors", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { first_name: REDACTED, last_name: REDACTED, id_number: null, id_number_hash: null, email: null, phone: null } },
  { id: "C.application_guarantors", table: "application_guarantors", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { first_name: REDACTED, last_name: REDACTED, id_number: null, id_type: null, nationality: null, email: null, phone: null, searchworx_extracted_data: null } }, // 70H F3 add — id_type + bureau payload
  { id: "C.application_tokens", table: "application_tokens", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { applicant_email: REDACTED } },                        // NOT NULL
  { id: "C.application_screening_payments", table: "application_screening_payments", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { paid_by_email: null } },

  // ── §7 C.1 — BUILD_14 FitScore / screening PII (P-1 coverage-drift fix — these tables/columns landed AFTER
  //    the plan was frozen, so they survived erasure). The Storage files referenced by the *_path columns are
  //    purged separately in erasure.ts (file-then-redact); screening_artifacts is manual-review (below). ──────
  { id: "C1.bank_statement_classifications", table: "application_bank_statement_classifications", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { bank_statement_doc_path: REDACTED, payee_signature: REDACTED, payee_description_example: REDACTED } },  // all NOT NULL → REDACTED; doc_path file purged in erasure.ts
  { id: "C1.application_screening_lines", table: "application_screening_lines", keyColumn: "application_id", keyFrom: "applicationId", appliesTo: ["applicant", "tenant"],
    fields: { pdf_storage_path: null, result_summary: null, searchworx_search_token: null } },                       // nullable; pdf file purged in erasure.ts

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
  // CD PII-disposition 2026-07-07 (Group C): the recipient MSISDN on an outbound WhatsApp. Strip the IDENTIFIER on a
  // tenant erasure; the message/comm record itself is retained under s17 (accountability) — purpose-based retention
  // applies to the event log, not the phone number. NOT NULL → REDACTED.
  { id: "D.whatsapp_messages", table: "whatsapp_messages", keyColumn: "tenant_id", keyFrom: "tenantId", appliesTo: ["tenant"],
    fields: { phone_number: REDACTED } },

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

// ─── F-3 DECLINED-APPLICANT PURGE (single 90-day tier) ─────────────────────────
//
// SINGLE retention tier (ADDENDUM_70H F3 — reworked from the earlier two-tier draft): a
// declined / not_shortlisted / withdrawn application's PII purges in full at 90 days. There is NO
// separate 12-month identity tier — identity, screening artefacts, and financial PII all purge together,
// matching the public PAIA Manual + credit-check-policy 90-day commitment and the live behaviour the old
// `rejected-applicant-purge.ts` rule already shipped (now retired and folded into this set).
//
// The executor (screeningArtefactPurge.ts) reuses the SAME stripGroup engine + Storage-delete approach the
// erasure cascade uses — a SCOPED replay of the plan, never a hand-coded parallel purge (locked decision #2).
// The column-strip set is DERIVED from ANONYMISE_PLAN below (DECLINED_APPLICANT_STRIP_GROUPS) so it cannot
// drift from the erasure SSOT — the 70H F3 review caught exactly that drift: an earlier hand-maintained
// subset silently dropped first_name/DOB/passport/applicant_email and the whole director/co-applicant/
// guarantor identity tables, leaving PII behind while stamping the row "purged in full".
//
// `screening_artifacts` (immutable-by-RLS, no DELETE policy → only the service client can remove it) is a
// WHOLE-ROW delete, not a column strip: it has no non-PII residue worth keeping once the 90-day window
// passes, and it cannot be column-redacted (its RLS blocks UPDATE). The erasure cascade still routes it to
// MANUAL_REVIEW_TARGETS for the DSAR path; the routine 90-day purge deletes it under service role.

/** A whole-table delete (not a column strip) keyed by application_id, with its Storage bucket + path column. */
export interface DeclinedApplicantDeleteTable {
  id: string
  table: string
  /** column on the row that holds a Storage object path to remove first (null = no file). */
  storagePathColumn: string | null
  /** the bucket the storagePathColumn references (only meaningful when storagePathColumn is set). */
  storageBucket: string | null
}

/** Tables whose ROWS are fully deleted at the 90-day mark (with their Storage files), keyed by application_id. */
export const DECLINED_APPLICANT_DELETE_TABLES: DeclinedApplicantDeleteTable[] = [
  // immutable-by-RLS bureau PDFs — service-role whole-row delete + remove the popia/screening PDF.
  { id: "F3.screening_artifacts", table: "screening_artifacts", storagePathColumn: "storage_path", storageBucket: "screening-reports" },
  // per-subject screening result lines — whole row; raw vendor PDF in screening-reports.
  { id: "F3.application_screening_lines", table: "application_screening_lines", storagePathColumn: "pdf_storage_path", storageBucket: "screening-reports" },
  // bank-statement classifications — whole row; the source statement lives in bank-statements.
  { id: "F3.bank_statement_classifications", table: "application_bank_statement_classifications", storagePathColumn: "bank_statement_doc_path", storageBucket: "bank-statements" },
  // iterative prescreen history — narrative + input_snapshot carry derived financial PII; whole row, no file.
  { id: "F3.application_prescreens", table: "application_prescreens", storagePathColumn: null, storageBucket: null },
]

/** Names of the tables the declined purge deletes whole-row — excluded from the column-strip replay below
 *  (no point stripping columns on a row that is about to be deleted entirely). */
const DECLINED_DELETE_TABLE_NAMES = new Set(DECLINED_APPLICANT_DELETE_TABLES.map((t) => t.table))

/**
 * Tables excluded from the AUTOMATIC declined purge ONLY — the DSAR erasure path (planForSubject) is
 * untouched; a subject who requests erasure still gets these stripped.
 *
 * `consent_verifications` (target_email / target_phone_e164): the automatic purge would have the org
 * unilaterally destroying its OWN proof that it held valid credit-check consent, with no subject request —
 * weakening its NCA/POPIA-complaint defence. That is NOT equivalent to the DSAR case (there the subject
 * asked for deletion). HOLD pending counsel — bundled with the FitScore/identity discrimination-defence
 * retention question (ADDENDUM_70H F3). Remove from this set once counsel rules.
 */
const AUTO_PURGE_EXCLUDED_TABLES = new Set(["consent_verifications"])

/**
 * The column-strip groups the single 90-day declined-applicant AUTOMATIC purge replays — DERIVED from
 * ANONYMISE_PLAN by construction, so the column/table set can NEVER drift from the erasure SSOT (the defect
 * the 70H F3 verification caught). = every application_id-keyed group that applies to the `applicant`
 * subject, EXCEPT (a) the artefact tables the purge deletes whole-row (screening_lines /
 * bank_statement_classifications) and (b) AUTO_PURGE_EXCLUDED_TABLES (counsel-pending). The per-table field
 * maps (REDACT for NOT-NULL columns, null otherwise) come straight from the plan. The executor replays these
 * through the SAME `stripGroup` engine the DSAR erasure uses — a scoped replay, never a hand-coded parallel
 * purge (locked decision #2). Resolves to: applications, application_co_applicants, application_directors,
 * application_guarantors (identity), application_tokens (applicant_email), application_screening_payments
 * (paid_by_email only — the transaction record stays). consent_verifications is HELD (see above).
 */
/**
 * F3 Q1(b-lite) Tier 2 — columns RETAINED past the 90-day raw purge as the 5-year decision-accountability
 * record (F3_SPEC_AMENDMENT §2/§3). They are EXCLUDED from the 90-day strip below and stripped later by the
 * complianceRecordsSweep at the 5-year mark (or earlier on subject DSAR erasure — a different code path).
 *
 * Most entries are declarative/future-proofing (not currently in the strip plan, or not-yet-migrated columns
 * — decided_at, decided_by, decision_stage, deciding_agent_capacity, audit_log_decision_entry_id land with
 * the §2.3 migration + §2.4 trigger). The only OPERATIVE exclusion against today's plan is `fitscore_components` (the numeric
 * per-dimension breakdown — retained), while fitscore_narrative / fitscore_material_flags /
 * fitscore_component_snapshot stay in the 90-day strip (Tier 1). The set is the SSOT: if the retained list
 * changes, the strip re-derives — no hand-coded parallel surface.
 */
export const F3_TIER_2_RETAINED_COLUMNS: Record<string, Set<string>> = {
  applications: new Set([
    // FitScore structural + cryptographic-anchor set (counsel pass 2)
    "fitscore", "fitscore_band", "fitscore_components", "fitscore_inputs_hash",
    "fitscore_engine_version", "fitscore_interpretation_version", "fitscore_narrative_prompt_version",
    // categorical codes (counsel-signed enum)
    "decline_reason_code", "adverse_factor_codes", "not_shortlisted_reason_code", "withdrawn_reason_code",
    "decline_reason_text",  // agent-discretion free-text exception (kept exception)
    // decision/accountability metadata (counsel pass 3)
    "status", "decided_at", "decided_by", "decision_stage",
    "deciding_agent_capacity", "audit_log_decision_entry_id",
    // derived ratios (counsel pass 4)
    "rent_to_income_ratio_at_decision", "dti_ratio_at_decision",
    "affordability_threshold_at_decision", "income_verification_status_at_decision",
    // policy linkage (counsel pass 4/6)
    "criminal_screening_policy_id", "criminal_screening_policy_version",
    "screening_policy_id", "screening_policy_version",
  ]),
  application_co_applicants: new Set([
    "fitscore", "fitscore_band", "fitscore_components",
    "fitscore_engine_version", "fitscore_interpretation_version", "fitscore_narrative_prompt_version",
    "decline_reason_code", "adverse_factor_codes",
    "status", "decided_at", "decided_by", "decision_stage",
  ]),
}

/** Columns the 5-year complianceRecordsSweep NULLs on a declined application (the Tier-2 accountability
 *  record), once its 5y window passes. = the retained set minus `status` (the bare terminal outcome stays
 *  on the shell row — it is not PII). Every entry is a real, nullable column (verified vs 010 §45). */
export const F3_TIER_2_FINAL_STRIP_COLUMNS: string[] = [...F3_TIER_2_RETAINED_COLUMNS.applications].filter(
  (c) => c !== "status",
)

export const DECLINED_APPLICANT_STRIP_GROUPS: AnonymiseGroup[] = ANONYMISE_PLAN
  .filter(
    (g) =>
      g.keyFrom === "applicationId" &&
      g.appliesTo.includes("applicant") &&
      !DECLINED_DELETE_TABLE_NAMES.has(g.table) &&
      !AUTO_PURGE_EXCLUDED_TABLES.has(g.table),
  )
  .map((g) => {
    // Tier 2: exclude the retained columns from the 90-day strip map (they purge at 5y, not 90d).
    const retained = F3_TIER_2_RETAINED_COLUMNS[g.table]
    if (!retained) return g
    const fields = Object.fromEntries(Object.entries(g.fields).filter(([col]) => !retained.has(col)))
    return { ...g, fields }
  })
