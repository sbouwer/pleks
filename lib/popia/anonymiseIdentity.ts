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
  /** The subject's own co-applicant rows — on applications someone ELSE leads (their `co_{id}/` documents too). */
  coApplicants: Array<{ id: string; applicationId: string }>
  /** Rows matched by email alone whose ID number conflicts — neither erased nor exported; surfaced for a human. A
   *  contact sent here takes its tenant, landlord and their rows with it: none of them is resolved. */
  needsReview: Array<{ table: EmailMatch["table"]; id: string; reason: string }>
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

/** Contacts whose primary email is the request's — every one, case-insensitively. This was an exact `maybeSingle`
 *  that pulled the contact's tenant, landlord, applications and co rows before any ID tie (DSAR follow-up 1); a second
 *  contact on the address made it error and resolve nothing. Each is now an email match like any other. */
async function contactsByEmail(db: Db, orgId: string, email: string): Promise<EmailMatch[]> {
  const f = emailFilter(email)
  const q = db.from("contacts").select("id, id_number_hash").eq("org_id", orgId)
  const { data, error } = await (f.exact ? q.eq("primary_email", f.value) : q.ilike("primary_email", f.value))
  logQueryError("resolveSubject contacts by email", error)
  return (data ?? []).map((r) => ({
    table: "contacts", id: r.id as string, applicationId: null, tenantId: null, hash: (r.id_number_hash as string | null) ?? null,
  }))
}

async function appIdsByTenant(db: Db, orgId: string, tenantId: string): Promise<string[]> {
  // applicant ≡ tenant: applications link via tenant_id (NOT user_id — that column doesn't exist).
  const { data, error } = await db.from("applications").select("id").eq("org_id", orgId).eq("tenant_id", tenantId)
  logQueryError("resolveSubject applications by tenant", error)
  return (data ?? []).map((r) => r.id as string)
}

/** A row matched by its stored email alone — a mailbox, not yet a person. */
interface EmailMatch {
  table: "contacts" | "applications" | "application_co_applicants"; id: string
  applicationId: string | null; tenantId: string | null; hash: string | null
}

async function appsByEmail(db: Db, orgId: string, email: string): Promise<EmailMatch[]> {
  // Case-insensitive, like the co lookup: the apply form stores the address as typed, while a portal DSAR carries
  // the lower-cased auth email — an exact match found no application for "Jane@…" (co DSAR walker, lead-side twin).
  const f = emailFilter(email)
  const q = db.from("applications").select("id, tenant_id, id_number_hash").eq("org_id", orgId)
  const { data, error } = await (f.exact ? q.eq("applicant_email", f.value) : q.ilike("applicant_email", f.value))
  logQueryError("resolveSubject applications by email", error)
  return (data ?? []).map((r) => ({
    table: "applications", id: r.id as string, applicationId: r.id as string,
    tenantId: (r.tenant_id as string | null) ?? null, hash: (r.id_number_hash as string | null) ?? null,
  }))
}

/** Identity hashes on the contact/tenant chain's rows — the contact and the applications keyed to its tenant. They
 *  vouch for email matches only when the request's account anchored the chain (partitionEmailMatches); otherwise they
 *  are one more witness, since a hash read off a shared mailbox's row may be anyone's (walker F2/R3). */
async function linkedIdHashes(db: Db, orgId: string, applicationIds: string[], contactId: string | null): Promise<Set<string>> {
  const out = new Set<string>()
  if (applicationIds.length) {
    const { data, error } = await db.from("applications").select("id_number_hash").eq("org_id", orgId).in("id", applicationIds)
    logQueryError("resolveSubject linked applications id hash", error)
    for (const r of data ?? []) if (r.id_number_hash) out.add(r.id_number_hash as string)
  }
  if (contactId) {
    const { data, error } = await db.from("contacts").select("id_number_hash").eq("org_id", orgId).eq("id", contactId).maybeSingle()
    logQueryError("resolveSubject contact id hash", error)
    if (data?.id_number_hash) out.add(data.id_number_hash as string)
  }
  return out
}

/**
 * Which email-only matches are the subject (Stéan ruling 2026-10-06, co DSAR follow-ups). An email is a mailbox, not
 * a person: a lead may enter a spouse under the household address. Erase only what a link or ONE consistent ID ties to
 * the subject; a conflict is never settled silently either way — not by erasing a third party in the subject's name,
 * and not by dropping the subject's own row under a completed request (a re-typed ID reads exactly like a different
 * person). Conflicting rows go to the Information Officer as manual review.
 *  - ANCHORED (the request's user account reached the subject's records): `chain` holds the hashes on those records,
 *    and a match is the subject only if it carries one of them. An unhashed match is evidence of nothing (walker R1).
 *  - Not anchored: nothing vouches — a contact found by email is itself one of the matches (walker R3, follow-up 1),
 *    so `chain` is empty here. The matches are the subject iff no two hashes among them and the chain differ, and each
 *    match carries a hash or is the mailbox's ONLY row — counting the chain's rows too, which were filtered out of
 *    `matches` before this call (walker N1: an unhashed spouse row beside a hashed chain is not "sole"). Otherwise all
 *    are review.
 */
function partitionEmailMatches(
  matches: EmailMatch[], chain: { hashes: Set<string>; rows: number }, anchored: boolean,
): { accept: EmailMatch[]; review: EmailMatch[] } {
  if (anchored && chain.hashes.size > 0) {
    const ok = (m: EmailMatch) => m.hash !== null && chain.hashes.has(m.hash)
    return { accept: matches.filter(ok), review: matches.filter((m) => !ok(m)) }
  }
  const hashes = new Set([...chain.hashes, ...matches.map((m) => m.hash).filter((h): h is string => h !== null)])
  const sole = matches.length + chain.rows <= 1
  const consistent = hashes.size <= 1 && (sole || matches.every((m) => m.hash !== null))
  return consistent ? { accept: matches, review: [] } : { accept: [], review: matches }
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
  // The request's own account reached the subject — the one link no shared mailbox can forge. A contact found by
  // email never anchors: it is an email match, partitioned in addEmailMatches before its chain is pulled.
  const anchored = tenantId !== null || landlordId !== null || contactId !== null

  if (contactId && !tenantId) tenantId = await roleIdByContact(db, "tenants", orgId, contactId)
  if (contactId && !landlordId) landlordId = await roleIdByContact(db, "landlords", orgId, contactId)

  const applicationIds: string[] = []
  if (tenantId) applicationIds.push(...(await appIdsByTenant(db, orgId, tenantId)))

  // Rows LINKED to the subject: applications by tenant, co rows by tenant_id (set when a co is promoted —
  // createTenantFromCoApplicant) and contact_id (no writer today; kept so a future link is not silently missed).
  const coLinked = await coRowsByLink(db, orgId, tenantId, contactId)
  const chain = await linkedIdHashes(db, orgId, applicationIds, contactId)
  for (const c of coLinked) if (c.hash) chain.add(c.hash)

  const out: ResolvedSubject = {
    orgId, userId, contactId, tenantId, landlordId, applicationIds,
    coApplicants: coLinked.map(({ id, applicationId }) => ({ id, applicationId })), needsReview: [],
  }
  const chainRows = (contactId ? 1 : 0) + applicationIds.length + coLinked.length
  if (subject.email) await addEmailMatches(db, out, subject.email, { hashes: chain, rows: chainRows }, anchored)
  return out
}

/** R-2: direct C-table fallback. A rejected applicant's PII is almost entirely in `applications` (the §7 danger zone)
 *  and may be reachable ONLY by applicant_email; a co's only key is usually the email they were invited on. Both are
 *  matched case-insensitively, then held to partitionEmailMatches before any of them counts as the subject. */
async function addEmailMatches(
  db: Db, out: ResolvedSubject, email: string, chain: { hashes: Set<string>; rows: number }, anchored: boolean,
): Promise<void> {
  const known = new Set([...out.applicationIds, ...out.coApplicants.map((c) => c.id), out.contactId])
  const matches = [
    ...await contactsByEmail(db, out.orgId, email), ...await appsByEmail(db, out.orgId, email), ...await coRowsByEmail(db, out.orgId, email),
  ].filter((m) => !known.has(m.id))
  const parts = partitionEmailMatches(matches, chain, anchored)
  // A subject holds one contact row. A second contact on the mailbox, or one beside the account's own, is a duplicate
  // record nobody has reconciled — the Information Officer's call, not a pick by query order.
  const contacts = parts.accept.filter((m) => m.table === "contacts")
  const contactsOk = contacts.length === 1 && !out.contactId
  const accept = contactsOk ? parts.accept : parts.accept.filter((m) => m.table !== "contacts")
  const review = contactsOk ? parts.review : [...parts.review, ...contacts]
  const hadTenant = out.tenantId !== null
  for (const m of accept) acceptMatch(out, m)
  for (const m of review) {
    out.needsReview.push({ table: m.table, id: m.id, reason: "matched by email only, and no ID number ties it to the subject (conflicting or missing) — confirm whose row it is before erasing" })
  }
  // Only now, with the contact tied, are its role rows reached — never for a contact sent to review (follow-up 1).
  if (contactsOk && out.contactId) {
    out.tenantId ??= await roleIdByContact(db, "tenants", out.orgId, out.contactId)
    out.landlordId ??= await roleIdByContact(db, "landlords", out.orgId, out.contactId)
  }
  if (out.tenantId && !out.contactId) out.contactId = await contactIdByTenant(db, out.orgId, out.tenantId)
  const ties = new Set([...chain.hashes, ...accept.map((m) => m.hash).filter((h): h is string => h !== null)])
  await addLinkedRows(db, out, {
    tenantId: hadTenant ? null : out.tenantId, contactId: contactsOk ? out.contactId : null,
    inReview: new Set(review.map((m) => m.id)), ties,
  })
}

function acceptMatch(out: ResolvedSubject, m: EmailMatch): void {
  if (m.table === "contacts") out.contactId = m.id
  else if (m.table === "applications") { out.applicationIds.push(m.id); out.tenantId ??= m.tenantId }
  else if (m.applicationId) out.coApplicants.push({ id: m.id, applicationId: m.applicationId })
}

/** Rows linked to a tenant or contact the subject reached only through an email match: the applications keyed to the
 *  tenant and the co rows keyed to either. A row already sent to review stays there — the link was found through an
 *  email match, so it cannot overrule (R4) — and a row whose ID number is not among the ones that tied the match goes
 *  to review too: the link is only as good as the match it hangs from. */
async function addLinkedRows(db: Db, out: ResolvedSubject, link: {
  tenantId: string | null; contactId: string | null; inReview: Set<string>; ties: Set<string>
}): Promise<void> {
  if (!link.tenantId && !link.contactId) return
  const apps = link.tenantId ? await appsWithHashByTenant(db, out.orgId, link.tenantId) : []
  const cos = await coRowsByLink(db, out.orgId, link.tenantId, link.contactId)
  const rows: EmailMatch[] = [
    ...apps.map((a) => ({ table: "applications" as const, id: a.id, applicationId: a.id, tenantId: link.tenantId, hash: a.hash })),
    ...cos.map((c) => ({ table: "application_co_applicants" as const, tenantId: null, ...c })),
  ]
  for (const r of rows) {
    if (link.inReview.has(r.id) || out.applicationIds.includes(r.id) || out.coApplicants.some((x) => x.id === r.id)) continue
    if (r.hash && link.ties.size > 0 && !link.ties.has(r.hash)) {
      out.needsReview.push({ table: r.table, id: r.id, reason: "linked to the subject only through a record matched by email, and its ID number differs — confirm whose row it is before erasing" })
    } else acceptMatch(out, r)
  }
}

async function appsWithHashByTenant(db: Db, orgId: string, tenantId: string): Promise<Array<{ id: string; hash: string | null }>> {
  const { data, error } = await db.from("applications").select("id, id_number_hash").eq("org_id", orgId).eq("tenant_id", tenantId)
  logQueryError("resolveSubject linked applications by tenant", error)
  return (data ?? []).map((r) => ({ id: r.id as string, hash: (r.id_number_hash as string | null) ?? null }))
}

/** An ILIKE pattern that matches `s` literally, case-insensitively: %, _ and \ are escaped. */
export function ilikeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Match an email column case-insensitively and literally. PostgREST rewrites `*` to `%` inside like/ilike operands
 *  (walker F4), and `*` is legal in an email's local part, so such an address falls back to an exact match — narrower
 *  is the safe direction for a key that drives erasure. */
function emailFilter(email: string): { exact: boolean; value: string } {
  return email.includes("*") ? { exact: true, value: email } : { exact: false, value: ilikeLiteral(email) }
}

async function coRowsByLink(db: Db, orgId: string, tenantId: string | null, contactId: string | null) {
  const out = new Map<string, { id: string; applicationId: string; hash: string | null }>()
  const links: Array<[string, string | null]> = [["tenant_id", tenantId], ["contact_id", contactId]]
  for (const [column, value] of links) {
    if (!value) continue
    const { data, error } = await coSelect(db, orgId).eq(column, value)
    logQueryError(`resolveSubject co rows by ${column}`, error)
    for (const r of data ?? []) out.set(r.id as string, coRow(r))
  }
  return [...out.values()]
}

/** One query per key, so an email is never spliced into an `.or()` filter string. */
async function coRowsByEmail(db: Db, orgId: string, email: string): Promise<EmailMatch[]> {
  const f = emailFilter(email)
  const q = coSelect(db, orgId)
  const { data, error } = await (f.exact ? q.eq("applicant_email", f.value) : q.ilike("applicant_email", f.value))
  logQueryError("resolveSubject co rows by email", error)
  return (data ?? []).map((r) => ({ table: "application_co_applicants", tenantId: null, ...coRow(r) }))
}

function coRow(r: Record<string, unknown>): { id: string; applicationId: string; hash: string | null } {
  return { id: r.id as string, applicationId: r.primary_application_id as string, hash: (r.id_number_hash as string | null) ?? null }
}

function coSelect(db: Db, orgId: string) {
  return db.from("application_co_applicants").select("id, primary_application_id, id_number_hash").eq("org_id", orgId)
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
    case "coApplicantId": return { single: null, list: resolved.coApplicants.map((c) => c.id) }
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
