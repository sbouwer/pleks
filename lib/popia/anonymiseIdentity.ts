/**
 * lib/popia/anonymiseIdentity.ts — §7 (D-5) identity anonymise: resolve → preview → execute
 *
 * Auth:   service-role only (called from erasure.ts under an approved data_subject_request)
 * Data:   resolves the subject across tenants/landlords/contacts/applications, then strips the
 *         declarative ANONYMISE_PLAN columns. Keys verified against live schema 2026-06-04.
 * Notes:  previewIdentityAnonymise is NON-destructive (counts only) — the safety gate: run it on dev
 *         before any real erasure. executeIdentityAnonymise applies the plan's redaction values
 *         (nullability-correct) scoped to the resolved subject ids, one recordAudit per group.
 *         Free-text / incidental PII is NOT auto-stripped — MANUAL_REVIEW_TARGETS go on the request
 *         for a human (D-16).
 */
import type { createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { planForSubject, type SubjectType, type KeyFrom } from "./anonymisePlan"

type Db = Awaited<ReturnType<typeof createServiceClient>>

export interface ResolvedSubject {
  orgId: string
  userId: string | null
  contactId: string | null
  tenantId: string | null
  landlordId: string | null
  applicationIds: string[]
}

export interface AnonymiseSubjectInput {
  org_id: string
  user_id?: string | null
  email?: string | null
}

/** Map a request's subject_role_context to a v1 subject type, or "supplier" (deferred → manual, D-14). */
export function subjectTypeFromRole(role: string | null | undefined): SubjectType | "supplier" | null {
  if (role === "tenant" || role === "applicant" || role === "landlord") return role
  if (role === "supplier" || role === "contractor") return "supplier"
  return null
}

/**
 * D-16 — free-text / incidental PII that is NOT auto-stripped (can't reliably find it; over-stripping
 * blanks third parties). Surfaced on the request for a human to redact-or-retain and record.
 */
export const MANUAL_REVIEW_TARGETS: ReadonlyArray<{ table: string; field: string; note: string }> = [
  { table: "communication_log", field: "body / body_full", note: "free-text message content may contain PII" },
  { table: "maintenance_requests", field: "description / completion_notes / cancellation_reason", note: "free-text notes" },
  { table: "document_generation_jobs", field: "body_html", note: "generated document body" },
  { table: "warranties", field: "claim_email / claim_phone", note: "claimant may be the subject or the manager (§7.1)" },
  { table: "(documents/storage)", field: "PDF/photo contents", note: "lease docs, inspection photos — out-of-band" },
]

/** Resolve a subject to the ids the plan keys on. Columns verified vs live schema (2026-06-04). */
export async function resolveSubject(db: Db, subject: AnonymiseSubjectInput): Promise<ResolvedSubject> {
  const orgId = subject.org_id
  const userId = subject.user_id ?? null
  let contactId: string | null = null
  let tenantId: string | null = null
  let landlordId: string | null = null

  if (userId) {
    const { data: t, error: tErr } = await db
      .from("tenants").select("id, contact_id").eq("org_id", orgId).eq("auth_user_id", userId).maybeSingle()
    logQueryError("resolveSubject tenants by user", tErr)
    if (t) { tenantId = t.id as string; contactId = (t.contact_id as string | null) ?? contactId }

    const { data: l, error: lErr } = await db
      .from("landlords").select("id, contact_id").eq("org_id", orgId).eq("auth_user_id", userId).maybeSingle()
    logQueryError("resolveSubject landlords by user", lErr)
    if (l) { landlordId = l.id as string; contactId = (l.contact_id as string | null) ?? contactId }
  }

  if (!contactId && subject.email) {
    const { data: c, error: cErr } = await db
      .from("contacts").select("id").eq("org_id", orgId).eq("primary_email", subject.email).maybeSingle()
    logQueryError("resolveSubject contacts by email", cErr)
    if (c) contactId = c.id as string
  }

  if (contactId && !tenantId) {
    const { data: t, error } = await db
      .from("tenants").select("id").eq("org_id", orgId).eq("contact_id", contactId).maybeSingle()
    logQueryError("resolveSubject tenants by contact", error)
    if (t) tenantId = t.id as string
  }
  if (contactId && !landlordId) {
    const { data: l, error } = await db
      .from("landlords").select("id").eq("org_id", orgId).eq("contact_id", contactId).maybeSingle()
    logQueryError("resolveSubject landlords by contact", error)
    if (l) landlordId = l.id as string
  }

  const applicationIds: string[] = []
  if (tenantId) {
    // applicant ≡ tenant: applications link via tenant_id (NOT user_id — that column doesn't exist).
    const { data, error } = await db
      .from("applications").select("id").eq("org_id", orgId).eq("tenant_id", tenantId)
    logQueryError("resolveSubject applications by tenant", error)
    for (const r of data ?? []) applicationIds.push(r.id as string)
  }

  return { orgId, userId, contactId, tenantId, landlordId, applicationIds }
}

/** The id(s) a group keys on, or null/[] if the subject has none. */
function idsForGroup(resolved: ResolvedSubject, keyFrom: KeyFrom): { single: string | null; list: string[] } {
  switch (keyFrom) {
    case "contactId":     return { single: resolved.contactId, list: [] }
    case "individualId":  return { single: resolved.contactId, list: [] }   // contact_employment.individual_id = contact id
    case "tenantId":      return { single: resolved.tenantId, list: [] }
    case "landlordId":    return { single: resolved.landlordId, list: [] }
    case "userId":        return { single: resolved.userId, list: [] }
    case "applicationId": return { single: null, list: resolved.applicationIds }
  }
}

export interface GroupOutcome { group: string; table: string; affected: number }

/** NON-DESTRUCTIVE dry-run: how many rows each group would touch. The safety gate before execute. */
export async function previewIdentityAnonymise(
  db: Db, resolved: ResolvedSubject, subjectType: SubjectType,
): Promise<{ groups: GroupOutcome[]; total: number; manual_review: typeof MANUAL_REVIEW_TARGETS }> {
  const groups: GroupOutcome[] = []
  let total = 0
  for (const g of planForSubject(subjectType)) {
    const { single, list } = idsForGroup(resolved, g.keyFrom)
    if (single === null && list.length === 0) continue
    // Scope by the resolved subject key ONLY — it's a globally-unique id already bound to the org by
    // resolveSubject. Do NOT add org_id: several plan tables (contact/application child tables,
    // user_profiles) have no org_id column, and filtering it would 42703 → silently skip the strip.
    const sel = db.from(g.table).select("id", { count: "exact", head: true })
    const q = single !== null ? sel.eq(g.keyColumn, single) : sel.in(g.keyColumn, list)
    const { count, error } = await q
    logQueryError(`previewIdentityAnonymise ${g.table}`, error)
    const n = count ?? 0
    if (n > 0) { groups.push({ group: g.id, table: g.table, affected: n }); total += n }
  }
  return { groups, total, manual_review: MANUAL_REVIEW_TARGETS }
}

/** DESTRUCTIVE: strip the plan's columns for the subject. One recordAudit per group. */
export async function executeIdentityAnonymise(
  db: Db, resolved: ResolvedSubject, subjectType: SubjectType, requestId: string, actorId: string,
): Promise<{ groups: GroupOutcome[]; total: number }> {
  const groups: GroupOutcome[] = []
  let total = 0
  for (const g of planForSubject(subjectType)) {
    const { single, list } = idsForGroup(resolved, g.keyFrom)
    if (single === null && list.length === 0) continue

    const base = db.from(g.table).update(g.fields)
    const q = single !== null ? base.eq(g.keyColumn, single) : base.in(g.keyColumn, list)
    const { data, error } = await q.select("id")
    logQueryError(`executeIdentityAnonymise ${g.table}`, error)
    const affected = (data ?? []).length
    if (affected > 0) {
      await recordAudit(db, {
        orgId: resolved.orgId, actorId, action: "UPDATE", table: g.table, recordId: single ?? list[0],
        after: { action: "popia_anonymise", group: g.id, fields: Object.keys(g.fields), rows: affected, request_id: requestId },
      })
      groups.push({ group: g.id, table: g.table, affected })
      total += affected
    }
  }
  return { groups, total }
}

/** Re-exported so callers don't need a second import. */
export type { AnonymiseGroup } from "./anonymisePlan"
