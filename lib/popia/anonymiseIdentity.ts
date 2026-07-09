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
import { planForSubject, REDACTED, type SubjectType, type KeyFrom, type AnonymiseGroup } from "./anonymisePlan"

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
  { table: "screening_artifacts", field: "(whole row)", note: "immutable-by-RLS bureau records — Information Officer must action erasure within SLA (ADDENDUM_POPIA_LIFECYCLE P-1)" },
  { table: "contractors", field: "notification_email", note: "supplier-subject PII — human-actioned until the supplier-erasure cascade ships (v1.1, D-14; CD PII-disposition 2026-07-07)" },
  { table: "hoa_unit_owners", field: "id_number / owner_email / owner_phone", note: "active-relationship subject PII (STSMA/scheme mgmt basis) — retain while owner holds the unit; erase on ceasing-ownership or DSAR, NOT by time. Human-actioned until an event-driven owner-erasure routine ships with HOA (CD PII-disposition 2026-07-07)" },
  { table: "lease_sureties", field: "full_name / deed_reference", note: "surety-of-record on a lease (deed of suretyship) — live contractual/accountability basis (s17): retain while the suretyship binds; erase on release (released_at) / lease end or DSAR, NOT by time or an unrelated tenant erasure. Human-actioned (LEG-NOTICES-01 A; same class as hoa_unit_owners)" },
  { table: "(documents/storage)", field: "PDF/photo contents", note: "lease docs, inspection photos — out-of-band" },
]

type RoleTable = "tenants" | "landlords"

async function roleByUser(db: Db, table: RoleTable, orgId: string, userId: string): Promise<{ id: string; contactId: string | null } | null> {
  const { data, error } = await db.from(table).select("id, contact_id").eq("org_id", orgId).eq("auth_user_id", userId).maybeSingle()
  logQueryError(`resolveSubject ${table} by user`, error)
  return data ? { id: data.id as string, contactId: (data.contact_id as string | null) ?? null } : null
}

async function roleIdByContact(db: Db, table: RoleTable, orgId: string, contactId: string): Promise<string | null> {
  const { data, error } = await db.from(table).select("id").eq("org_id", orgId).eq("contact_id", contactId).maybeSingle()
  logQueryError(`resolveSubject ${table} by contact`, error)
  return (data?.id as string | undefined) ?? null
}

async function contactByEmail(db: Db, orgId: string, email: string): Promise<string | null> {
  const { data, error } = await db.from("contacts").select("id").eq("org_id", orgId).eq("primary_email", email).maybeSingle()
  logQueryError("resolveSubject contacts by email", error)
  return (data?.id as string | undefined) ?? null
}

async function appIdsByTenant(db: Db, orgId: string, tenantId: string): Promise<string[]> {
  // applicant ≡ tenant: applications link via tenant_id (NOT user_id — that column doesn't exist).
  const { data, error } = await db.from("applications").select("id").eq("org_id", orgId).eq("tenant_id", tenantId)
  logQueryError("resolveSubject applications by tenant", error)
  return (data ?? []).map((r) => r.id as string)
}

async function appsByEmail(db: Db, orgId: string, email: string): Promise<Array<{ id: string; tenantId: string | null }>> {
  const { data, error } = await db.from("applications").select("id, tenant_id").eq("org_id", orgId).eq("applicant_email", email)
  logQueryError("resolveSubject applications by email", error)
  return (data ?? []).map((r) => ({ id: r.id as string, tenantId: (r.tenant_id as string | null) ?? null }))
}

async function contactIdByTenant(db: Db, orgId: string, tenantId: string): Promise<string | null> {
  const { data, error } = await db.from("tenants").select("contact_id").eq("org_id", orgId).eq("id", tenantId).maybeSingle()
  logQueryError("resolveSubject tenant→contact backfill", error)
  return (data?.contact_id as string | undefined) ?? null
}

/** Resolve a subject to the ids the plan keys on. Columns verified vs live schema (2026-06-04). */
export async function resolveSubject(db: Db, subject: AnonymiseSubjectInput): Promise<ResolvedSubject> {
  const orgId = subject.org_id
  const userId = subject.user_id ?? null
  let contactId: string | null = null
  let tenantId: string | null = null
  let landlordId: string | null = null

  if (userId) {
    const t = await roleByUser(db, "tenants", orgId, userId)
    if (t) { tenantId = t.id; contactId = t.contactId ?? contactId }
    const l = await roleByUser(db, "landlords", orgId, userId)
    if (l) { landlordId = l.id; contactId = l.contactId ?? contactId }
  }

  if (!contactId && subject.email) contactId = await contactByEmail(db, orgId, subject.email)
  if (contactId && !tenantId) tenantId = await roleIdByContact(db, "tenants", orgId, contactId)
  if (contactId && !landlordId) landlordId = await roleIdByContact(db, "landlords", orgId, contactId)

  const applicationIds: string[] = []
  if (tenantId) applicationIds.push(...(await appIdsByTenant(db, orgId, tenantId)))

  // R-2: direct C-table fallback. A rejected applicant's PII is almost entirely in `applications`
  // (the §7 danger zone) and may be reachable ONLY by applicant_email — no contacts.primary_email or
  // tenant chain. Resolve applications by email directly + backfill tenant→contact so A/B strip too.
  // (id_number_hash isn't carried on the request, so applicant_email is the available key.)
  if (subject.email) {
    for (const a of await appsByEmail(db, orgId, subject.email)) {
      if (!applicationIds.includes(a.id)) applicationIds.push(a.id)
      tenantId ??= a.tenantId
    }
    if (tenantId && !contactId) contactId = await contactIdByTenant(db, orgId, tenantId)
  }

  return { orgId, userId, contactId, tenantId, landlordId, applicationIds }
}

/**
 * Lease ids a tenant-subject is party to: primary tenant on the lease (leases.tenant_id) ∪ co-tenant
 * (lease_co_tenants.tenant_id → lease_id). There is NO `lease_parties` table — this is the one true
 * source for "the subject's leases", shared by the DSAR export + retention so the lookup can't drift.
 */
export async function subjectLeaseIds(db: Db, orgId: string, tenantId: string | null): Promise<string[]> {
  if (!tenantId) return []
  const ids = new Set<string>()
  const { data: primary, error: pErr } = await db
    .from("leases").select("id").eq("org_id", orgId).eq("tenant_id", tenantId)
  if (pErr) console.error("subjectLeaseIds leases:", pErr.message)
  for (const r of primary ?? []) ids.add(r.id as string)
  const { data: co, error: cErr } = await db
    .from("lease_co_tenants").select("lease_id").eq("org_id", orgId).eq("tenant_id", tenantId)
  if (cErr) console.error("subjectLeaseIds lease_co_tenants:", cErr.message)
  for (const r of co ?? []) ids.add(r.lease_id as string)
  return [...ids]
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

/**
 * DESTRUCTIVE: strip the plan's columns for the subject. One recordAudit per group.
 *
 * R-3 — non-atomicity is a CONSCIOUS decision: each group is a separate PostgREST update (PostgREST
 * has no multi-statement transaction), NOT all-or-nothing. This is safe because (a) every strip is
 * idempotent (fixed null/REDACTED values — re-running is a no-op), (b) stripGroup self-heals the main
 * drift failure (R-4), and (c) the caller records the completed `groups` on the request
 * (erasure_records_affected.identity_groups), so a stuck group is visible and the whole op is safely
 * re-runnable to completion. If a future requirement needs true rollback, wrap this in one SQL RPC.
 *
 * V4: a group whose strip returns -1 (non-self-healed error) is collected and THROWN at the end — the
 * caller must NOT mark the request 'completed' with PII surviving (this is exactly what let plan-bug A,
 * the co_applicants phantom keyColumn, hide). Successful groups are already audited (durable partial
 * progress) and every strip is idempotent, so re-running after the fix safely converges.
 */
export async function executeIdentityAnonymise(
  db: Db, resolved: ResolvedSubject, subjectType: SubjectType, requestId: string, actorId: string,
): Promise<{ groups: GroupOutcome[]; total: number }> {
  const groups: GroupOutcome[] = []
  const failedGroups: string[] = []
  let total = 0
  for (const g of planForSubject(subjectType)) {
    const { single, list } = idsForGroup(resolved, g.keyFrom)
    if (single === null && list.length === 0) continue

    const affected = await stripGroup(db, g, single, list)
    if (affected < 0) { failedGroups.push(g.id); continue }   // V4: non-self-healed strip error — surface, don't complete
    if (affected > 0) {
      await recordAudit(db, {
        orgId: resolved.orgId, actorId, action: "UPDATE", table: g.table, recordId: single ?? list[0],
        after: { action: "popia_anonymise", group: g.id, fields: Object.keys(g.fields), rows: affected, request_id: requestId },
      })
      groups.push({ group: g.id, table: g.table, affected })
      total += affected
    }
  }
  if (failedGroups.length > 0) {
    // V4: never let the erasure be marked complete with a swallowed strip error. Idempotent → safe to re-run.
    throw new Error(`[popia/anonymise] identity strip failed for groups [${failedGroups.join(", ")}] — erasure NOT complete (safe to re-run; idempotent).`)
  }
  return { groups, total }
}

/**
 * Apply one group's redaction, scoped to the subject key. R-4: if the strip hits a NOT-NULL violation
 * (23502) — schema drift that flipped a plan `null` against a now-NOT-NULL column — coerce that one
 * column to REDACTED and retry, so drift can't wall the cascade into a permanent partial erasure (the
 * principal R-3 cause). preview can't catch this (it only counts) — the guard has to be at execute.
 *
 * RETURN CONTRACT (70H F3 V4): ≥0 is a genuine rowcount (0 = matched no rows, which is legitimately
 * normal — e.g. a solo applicant has no co-applicant rows). **-1 is a non-self-healed error** (any code
 * other than a coercible 23502, or self-heal exhausted) — DISTINCT from "0 rows" so a caller can abort
 * BEFORE marking a one-way `pii_purged_at`/erasure-complete latch. A `0` must never be read as "errored"
 * (the swallow-then-mark-done trap that hid both 42703 plan-bugs); a `-1` must never be swallowed.
 */
export async function stripGroup(db: Db, group: AnonymiseGroup, single: string | null, list: string[]): Promise<number> {
  let fields: Record<string, string | null> = group.fields
  for (let attempt = 0; attempt < 16; attempt++) {
    const base = db.from(group.table).update(fields)
    const q = single !== null ? base.eq(group.keyColumn, single) : base.in(group.keyColumn, list)
    const { data, error } = await q.select("id")
    if (!error) return (data ?? []).length
    const col = error.code === "23502" ? /column "([^"]+)"/.exec(error.message ?? "")?.[1] : undefined
    if (col && fields[col] === null) { fields = { ...fields, [col]: REDACTED }; continue }  // coerce + retry
    logQueryError(`executeIdentityAnonymise ${group.table}`, error)
    return -1   // V4: non-self-healed error — signal distinctly so the caller aborts before the latch
  }
  return -1     // V4: self-heal exhausted — also a failure, never a silent "0 rows"
}
