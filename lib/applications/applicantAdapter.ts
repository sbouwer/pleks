/**
 * lib/applications/applicantAdapter.ts — the uniform applicant read/write seam (ADDENDUM_14R §6).
 *
 * Full-peer applicants: the lead lives ON the `applications` row (denormalised fields), co-applicants are
 * `application_co_applicants` rows. This adapter normalises BOTH into one `UniformApplicant` shape and routes
 * writes to the right table — so the flow / hub / submit / status consume a SINGLE shape and never branch on
 * lead-vs-co. The lead↔co asymmetry lives ENTIRELY here: a future uniform-applicant-table migration (14R §2
 * option a) changes only this file's internals, not any caller.
 *
 * This is the at-rest read/write BOUNDARY: id_number / date_of_birth / spouse_info are AES-GCM encrypted, so we
 * DECRYPT on read here and ENCRYPT on write here (mirrors assembleAssessment's read boundary + the save-draft and
 * co-applicant-save write boundaries — same crypto helpers).
 *
 * Phase 1 (foundation, ADDENDUM_14R §8.1): pure mappers + payload builders + two thin db wrappers, fully
 * unit-tested. NOT yet wired into any route — no behaviour change. The consent_log POPIA audit stays a route-layer
 * concern (it owns org/subject/IP); this writes the applicant ROW only, including the stage1_consent_* columns.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { encryptIdNumber, decryptIdNumber, encryptDob, decryptDob, encryptSpouseInfo, decryptSpouseInfo, hashIdNumber } from "@/lib/crypto/idNumber"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** A peer's stable handle: the lead is "primary" (the application row itself); a co is "co_<row id>". */
export type ApplicantRef = "primary" | `co_${string}`
export type ApplicantRole = "primary" | "co_applicant" | "guarantor"
export type ApplicantStatus = "not_started" | "in_progress" | "completed"

/** The single shape every peer-facing caller (flow, hub, submit, status) consumes. idNumber/dob/spouseInfo are
 *  DECRYPTED here — never re-encrypt for display; on write, pass the raw value back through `writeApplicant`. */
export interface UniformApplicant {
  ref: ApplicantRef
  isLead: boolean
  role: ApplicantRole
  identity: {
    firstName: string | null; lastName: string | null
    idType: string | null; idNumber: string | null; dob: string | null
    email: string | null; phone: string | null
    maritalStatus: string | null; matrimonialRegime: string | null
    spouseInfo: Record<string, unknown> | null
    addresses: unknown[]
  }
  employment: { type: string | null; employerName: string | null; startDate: string | null; details: Record<string, unknown> | null }
  income: { grossMonthlyCents: number | null; sources: unknown[] | null }
  obligations: { declaredMonthlyCents: number | null; expenses: unknown[] | null; dependentAdults: number | null; dependentMinors: number | null; schoolFeesCents: number | null }
  documents: { submitted: string[]; subjectRef: string }
  consentGiven: boolean
  status: ApplicantStatus
  // Context — mostly co-only (isSuretyDirector/startedAt/declinedAt) or lead-only (applicantType/companyInfo).
  isSuretyDirector: boolean
  startedAt: string | null
  declinedAt: string | null
  applicantType: string | null
  companyInfo: Record<string, unknown> | null
  sectionData: Record<string, unknown> | null
}

/** Raw `applications` row (the lead). All optional — a partial draft fills these incrementally. */
export interface LeadRow {
  first_name?: string | null; last_name?: string | null
  id_type?: string | null; id_number?: string | null; date_of_birth?: string | null
  applicant_email?: string | null; applicant_phone?: string | null
  marital_status?: string | null; matrimonial_regime?: string | null; spouse_info?: Record<string, unknown> | null
  applicant_addresses?: unknown[] | null
  employer_name?: string | null; employment_type?: string | null; employment_start_date?: string | null; employment_details?: Record<string, unknown> | null
  gross_monthly_income_cents?: number | null; income_sources?: unknown[] | null
  declared_monthly_obligations_cents?: number | null; expenses?: unknown[] | null
  dependent_adults_count?: number | null; dependent_minors_count?: number | null; school_fees_cents?: number | null
  documents_submitted?: string[] | null
  stage1_consent_given?: boolean | null
  draft_saved_at?: string | null
  applicant_type?: string | null; company_info?: Record<string, unknown> | null
}

/** Raw `application_co_applicants` row (a co). `id` is required (it forms the ref). The co row is leaner than the
 *  lead row — no income_sources/expenses/dependents/employment_start_date/details columns yet (14R §2: the co
 *  schema expands under (a); until then those map to null and `coColumns` ignores them). */
export interface CoRow {
  id: string
  first_name?: string | null; last_name?: string | null
  id_type?: string | null; id_number?: string | null; date_of_birth?: string | null
  applicant_email?: string | null; applicant_phone?: string | null
  marital_status?: string | null; matrimonial_regime?: string | null; spouse_info?: Record<string, unknown> | null
  current_address?: unknown | null
  employer_name?: string | null; employment_type?: string | null
  gross_monthly_income_cents?: number | null; declared_monthly_obligations_cents?: number | null
  documents_submitted?: string[] | null
  stage1_consent_given?: boolean | null
  started_at?: string | null; declined_at?: string | null
  is_surety_director?: boolean | null; role?: string | null
  section_data?: Record<string, unknown> | null
}

function deriveStatus(consentGiven: boolean, hasStarted: boolean): ApplicantStatus {
  if (consentGiven) return "completed"
  return hasStarted ? "in_progress" : "not_started"
}

/** Lead `applications` row → uniform. Decrypts id/dob/spouse. status: completed once consent given, else
 *  in_progress once any draft exists (saved or named), else not_started. */
export function mapLeadRow(row: LeadRow): UniformApplicant {
  const consentGiven = row.stage1_consent_given === true
  return {
    ref: "primary", isLead: true, role: "primary",
    identity: {
      firstName: row.first_name ?? null, lastName: row.last_name ?? null,
      idType: row.id_type ?? null, idNumber: decryptIdNumber(row.id_number ?? null), dob: decryptDob(row.date_of_birth ?? null),
      email: row.applicant_email ?? null, phone: row.applicant_phone ?? null,
      maritalStatus: row.marital_status ?? null, matrimonialRegime: row.matrimonial_regime ?? null,
      spouseInfo: decryptSpouseInfo(row.spouse_info ?? null),
      addresses: Array.isArray(row.applicant_addresses) ? row.applicant_addresses : [],
    },
    employment: { type: row.employment_type ?? null, employerName: row.employer_name ?? null, startDate: row.employment_start_date ?? null, details: row.employment_details ?? null },
    income: { grossMonthlyCents: row.gross_monthly_income_cents ?? null, sources: Array.isArray(row.income_sources) ? row.income_sources : null },
    obligations: {
      declaredMonthlyCents: row.declared_monthly_obligations_cents ?? null,
      expenses: Array.isArray(row.expenses) ? row.expenses : null,
      dependentAdults: row.dependent_adults_count ?? null, dependentMinors: row.dependent_minors_count ?? null, schoolFeesCents: row.school_fees_cents ?? null,
    },
    documents: { submitted: Array.isArray(row.documents_submitted) ? row.documents_submitted : [], subjectRef: "primary" },
    consentGiven,
    status: deriveStatus(consentGiven, !!row.draft_saved_at || !!row.first_name),
    isSuretyDirector: false, startedAt: row.draft_saved_at ?? null, declinedAt: null,
    applicantType: row.applicant_type ?? null, companyInfo: row.company_info ?? null, sectionData: null,
  }
}

/** Co `application_co_applicants` row → uniform. role = explicit `guarantor` OR a surety director, else
 *  co_applicant (same rule as assembleAssessment). status: completed once consent given, else in_progress once
 *  they've opened their link (started_at), else not_started (invited). */
export function mapCoRow(row: CoRow): UniformApplicant {
  const consentGiven = row.stage1_consent_given === true
  const role: ApplicantRole = row.role === "guarantor" || row.is_surety_director === true ? "guarantor" : "co_applicant"
  return {
    ref: `co_${row.id}`, isLead: false, role,
    identity: {
      firstName: row.first_name ?? null, lastName: row.last_name ?? null,
      idType: row.id_type ?? null, idNumber: decryptIdNumber(row.id_number ?? null), dob: decryptDob(row.date_of_birth ?? null),
      email: row.applicant_email ?? null, phone: row.applicant_phone ?? null,
      maritalStatus: row.marital_status ?? null, matrimonialRegime: row.matrimonial_regime ?? null,
      spouseInfo: decryptSpouseInfo(row.spouse_info ?? null),
      addresses: row.current_address ? [row.current_address] : [],
    },
    employment: { type: row.employment_type ?? null, employerName: row.employer_name ?? null, startDate: null, details: null },
    income: { grossMonthlyCents: row.gross_monthly_income_cents ?? null, sources: null },
    obligations: { declaredMonthlyCents: row.declared_monthly_obligations_cents ?? null, expenses: null, dependentAdults: null, dependentMinors: null, schoolFeesCents: null },
    documents: { submitted: Array.isArray(row.documents_submitted) ? row.documents_submitted : [], subjectRef: row.id },
    consentGiven,
    status: deriveStatus(consentGiven, !!row.started_at),
    isSuretyDirector: row.is_surety_director === true, startedAt: row.started_at ?? null, declinedAt: row.declined_at ?? null,
    applicantType: null, companyInfo: null, sectionData: row.section_data ?? null,
  }
}

/** A partial uniform update. Only keys PRESENT (!== undefined) are written; `null` clears, absent leaves intact.
 *  consentAt/consentIp accompany consentGiven=true (writeApplicant stamps consentAt when the caller omits it). */
export interface UniformWritePatch {
  firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null
  idType?: string | null; idNumber?: string | null; dob?: string | null
  maritalStatus?: string | null; matrimonialRegime?: string | null; spouseInfo?: Record<string, unknown> | null
  addresses?: unknown[] | null
  employmentType?: string | null; employerName?: string | null; employmentStartDate?: string | null; employmentDetails?: Record<string, unknown> | null
  grossMonthlyIncomeCents?: number | null; incomeSources?: unknown[] | null
  declaredMonthlyObligationsCents?: number | null; expenses?: unknown[] | null
  dependentAdults?: number | null; dependentMinors?: number | null; schoolFeesCents?: number | null
  applicantType?: string | null; companyInfo?: Record<string, unknown> | null
  sectionData?: Record<string, unknown> | null
  consentGiven?: boolean; consentIp?: string | null; consentAt?: string | null
}

// Patch → column mapping is data-driven (a flat passthrough table per target table) so the at-rest crypto + the
// consent stamp live in ONE shared place and neither builder grows an unreadable if-ladder. Only keys PRESENT in
// the patch are emitted (partial update); a few keys carry a small transform (coerce ""→null, cap addresses, etc.).
type Transform = (v: unknown) => unknown
type ColMap = ReadonlyArray<readonly [keyof UniformWritePatch, string, Transform?]>
const orNull: Transform = (v) => v || null
const orSaId: Transform = (v) => v || "sa_id"
const cap5: Transform = (v) => (Array.isArray(v) ? v.slice(0, 5) : null)
const firstAddr: Transform = (v) => (Array.isArray(v) ? (v[0] ?? null) : null)

function applyMap(p: UniformWritePatch, map: ColMap, out: Record<string, unknown>): void {
  for (const [key, col, fn] of map) {
    const v = p[key]
    if (v !== undefined) out[col] = fn ? fn(v) : v
  }
}

/** Shared at-rest encryption — id_number (+ hash from the RAW value), dob, spouse_info — for BOTH tables. */
function applyCrypto(p: UniformWritePatch, out: Record<string, unknown>): void {
  if (p.idNumber !== undefined) { out.id_number = encryptIdNumber(p.idNumber); out.id_number_hash = p.idNumber ? hashIdNumber(p.idNumber) : null }
  if (p.dob !== undefined) out.date_of_birth = encryptDob(p.dob)
  if (p.spouseInfo !== undefined) out.spouse_info = encryptSpouseInfo(p.spouseInfo)
}

/** Shared stage-1 consent stamp (the consent_log audit row stays a route concern — see file header). */
function applyConsent(p: UniformWritePatch, out: Record<string, unknown>): void {
  if (p.consentGiven === true) { out.stage1_consent_given = true; out.stage1_consent_given_at = p.consentAt ?? null; out.stage1_consent_ip = p.consentIp ?? null }
}

const LEAD_MAP: ColMap = [
  ["firstName", "first_name"], ["lastName", "last_name"], ["phone", "applicant_phone"],
  ["idType", "id_type", orNull],
  ["maritalStatus", "marital_status", orNull], ["matrimonialRegime", "matrimonial_regime", orNull],
  ["addresses", "applicant_addresses", cap5],
  ["employmentType", "employment_type", orNull], ["employerName", "employer_name", orNull],
  ["employmentStartDate", "employment_start_date", orNull], ["employmentDetails", "employment_details"],
  ["grossMonthlyIncomeCents", "gross_monthly_income_cents"], ["incomeSources", "income_sources"],
  ["declaredMonthlyObligationsCents", "declared_monthly_obligations_cents"], ["expenses", "expenses"],
  ["dependentAdults", "dependent_adults_count"], ["dependentMinors", "dependent_minors_count"], ["schoolFeesCents", "school_fees_cents"],
  ["applicantType", "applicant_type"], ["companyInfo", "company_info"],
]

// The co row is leaner — lead-only keys (income_sources, expenses, dependents, employment_start/details,
// applicant_type, company_info) are simply absent from this map, so they're dropped (14R §2). addresses fold to the
// single current_address; id_type defaults sa_id (co-save parity); applicant_email is co-only here.
const CO_MAP: ColMap = [
  ["firstName", "first_name"], ["lastName", "last_name"], ["phone", "applicant_phone"], ["email", "applicant_email"],
  ["idType", "id_type", orSaId],
  ["maritalStatus", "marital_status", orNull], ["matrimonialRegime", "matrimonial_regime", orNull],
  ["addresses", "current_address", firstAddr],
  ["employmentType", "employment_type", orNull], ["employerName", "employer_name", orNull],
  ["grossMonthlyIncomeCents", "gross_monthly_income_cents"], ["declaredMonthlyObligationsCents", "declared_monthly_obligations_cents"],
  ["sectionData", "section_data"],
]

/** Patch → `applications` columns (lead). Encrypts id/dob/spouse; `applicant_addresses` capped at 5 (save-draft
 *  parity). Pure (no I/O) — unit-testable. */
export function leadColumns(p: UniformWritePatch): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  applyMap(p, LEAD_MAP, c)
  applyCrypto(p, c)
  applyConsent(p, c)
  return c
}

/** Patch → `application_co_applicants` columns (a co). Same crypto + consent; see CO_MAP for the leaner shape. */
export function coColumns(p: UniformWritePatch): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  applyMap(p, CO_MAP, c)
  applyCrypto(p, c)
  applyConsent(p, c)
  return c
}

const LEAD_COLS = "first_name, last_name, id_type, id_number, date_of_birth, applicant_email, applicant_phone, marital_status, matrimonial_regime, spouse_info, applicant_addresses, employer_name, employment_type, employment_start_date, employment_details, gross_monthly_income_cents, income_sources, declared_monthly_obligations_cents, expenses, dependent_adults_count, dependent_minors_count, school_fees_cents, documents_submitted, stage1_consent_given, draft_saved_at, applicant_type, company_info"
const CO_COLS = "id, first_name, last_name, id_type, id_number, date_of_birth, applicant_email, applicant_phone, marital_status, matrimonial_regime, spouse_info, current_address, employer_name, employment_type, gross_monthly_income_cents, declared_monthly_obligations_cents, documents_submitted, stage1_consent_given, started_at, declined_at, is_surety_director, role, section_data, co_applicant_index"

/** Read every peer on an application as one uniform set: the lead (the applications row) first, then the co's
 *  ordered by co_applicant_index. Declined co's are INCLUDED (declinedAt is exposed) so the hub can show them;
 *  callers filter if they want only active peers. */
export async function getApplicants(db: SupabaseClient, applicationId: string): Promise<UniformApplicant[]> {
  const { data: lead, error: leadErr } = await db.from("applications").select(LEAD_COLS).eq("id", applicationId).maybeSingle()
  logQueryError("applicantAdapter getApplicants lead", leadErr)
  const { data: coRows, error: coErr } = await db.from("application_co_applicants").select(CO_COLS).eq("primary_application_id", applicationId).order("co_applicant_index", { ascending: true })
  logQueryError("applicantAdapter getApplicants co", coErr)

  const out: UniformApplicant[] = []
  if (lead) out.push(mapLeadRow(lead as LeadRow))
  for (const c of (coRows ?? []) as CoRow[]) out.push(mapCoRow(c))
  return out
}

/** Write a partial update to whichever table backs `ref` — the SINGLE write path; callers never branch on
 *  lead-vs-co. consent_log (POPIA audit) is NOT written here (route-layer concern). Stamps consentAt when the
 *  caller marks consentGiven without supplying a timestamp. Returns the Supabase error (or null) — no throw. */
export async function writeApplicant(db: SupabaseClient, applicationId: string, ref: ApplicantRef, patch: UniformWritePatch): Promise<{ error: unknown }> {
  const p: UniformWritePatch = patch.consentGiven === true && !patch.consentAt ? { ...patch, consentAt: new Date().toISOString() } : patch
  if (ref === "primary") {
    const cols = leadColumns(p)
    if (Object.keys(cols).length === 0) return { error: null }
    const { error } = await db.from("applications").update(cols).eq("id", applicationId)
    logQueryError("applicantAdapter writeApplicant lead", error)
    return { error }
  }
  const coId = ref.slice("co_".length)
  const cols = coColumns(p)
  if (Object.keys(cols).length === 0) return { error: null }
  const { error } = await db.from("application_co_applicants").update(cols).eq("id", coId)
  logQueryError("applicantAdapter writeApplicant co", error)
  return { error }
}
