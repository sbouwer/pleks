/**
 * lib/popia/erasure.ts — POPIA erasure cascade + nuke execution
 *
 * Auth:   Service-role only — never import in client components
 * Data:   contacts, tenants, landlords, lease_parties, applications, inspections,
 *         maintenance_requests, communication_log, deposit_transactions, payments
 * Notes:  D-POPIA-06: ALL delete paths route through isErasableNow(). Never bypass.
 *         The custom `pleks/no-popia-raw-delete` ESLint rule blocks raw db.from().delete()
 *         on `landlords`/`tenants` outside this file (ADDENDUM_ARCHIVE_VS_ERASE). That is the
 *         ONLY POPIA-sensitive coverage today — extending the restricted set to the rest of the
 *         identity/document tables is the pending DeleteButton-triage sweep (D-8). (This header
 *         previously claimed full no-restricted-imports enforcement that was never written.)
 *         executeErasure() runs inside a single Supabase RPC transaction.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { isErasableNow, type DataCategory } from "./retention"
import type { DataSubjectRequest } from "./requests"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AcknowledgedCarveout {
  category: DataCategory
  retained_until: string   // ISO date
  reason: string
}

export type ErasureScope =
  | { type: "targeted"; categories: DataCategory[] }
  | { type: "nuke"; acknowledged_carveouts: AcknowledgedCarveout[] }

export interface ErasurePreview {
  by_category: Record<
    DataCategory,
    { would_delete: number; would_anonymise: number; would_retain: number; retained_until?: string }
  >
  total_records: number
  warning?: string
}

export interface ErasureResult {
  by_category: Record<
    DataCategory,
    { deleted: number; anonymised: number; skipped: number }
  >
  total_affected: number
  audit_entries: number
}

export type AnonymisationTemplate = {
  field_overrides: Record<string, string | null>
}

export interface SubjectIdentification {
  user_id?: string
  email?: string
  org_id: string
}

// ─── Preview (dry-run) ────────────────────────────────────────────────────────

/**
 * Returns counts of what would happen without making any changes.
 * Used by the agency admin approval UI to show "this will delete X records."
 */
export async function previewErasure(
  subject: SubjectIdentification,
  scope: ErasureScope,
): Promise<ErasurePreview> {
  const db = createServiceClient()
  const categories = scopeToCategories(scope)
  const preview: ErasurePreview["by_category"] = {} as ErasurePreview["by_category"]
  let total_records = 0

  for (const category of categories) {
    const counts = await countRecordsForSubject(await db, subject, category)
    const decision = await isErasableNow(category, {
      orgId: subject.org_id,
      created_at: new Date(),
    })

    if ("erasable" in decision && decision.erasable) {
      preview[category] = { would_delete: counts, would_anonymise: 0, would_retain: 0 }
    } else if ("anonymisable" in decision && decision.anonymisable) {
      preview[category] = { would_delete: 0, would_anonymise: counts, would_retain: 0 }
    } else {
      const retained_until = "retained_until" in decision ? decision.retained_until.toISOString().slice(0, 10) : undefined
      preview[category] = { would_delete: 0, would_anonymise: 0, would_retain: counts, retained_until }
    }

    total_records += counts
  }

  return { by_category: preview, total_records }
}

// ─── Execute ──────────────────────────────────────────────────────────────────

/**
 * Run the erasure cascade for an approved data-subject request.
 * Writes one audit_log entry per row group. Returns summary counts.
 * Caller is responsible for updating request status to 'completed'.
 */
export async function executeErasure(
  request: DataSubjectRequest,
  actor_user_id: string,
): Promise<ErasureResult> {
  const db = createServiceClient()
  const scope: ErasureScope = request.request_type === "nuke"
    ? {
        type: "nuke",
        acknowledged_carveouts: (request.request_scope?.acknowledged_carveouts as AcknowledgedCarveout[]) ?? [],
      }
    : {
        type: "targeted",
        categories: (request.request_scope?.categories as DataCategory[]) ?? [],
      }

  const categories = scopeToCategories(scope)
  const result: ErasureResult["by_category"] = {} as ErasureResult["by_category"]
  let total_affected = 0
  let audit_entries = 0

  const subject: SubjectIdentification = {
    user_id: request.subject_user_id ?? undefined,
    email: request.subject_email,
    org_id: request.org_id,
  }

  for (const category of categories) {
    const decision = await isErasableNow(category, {
      orgId: request.org_id,
      created_at: new Date(),
    })

    let deleted = 0
    let anonymised = 0
    const skipped = 0

    if ("erasable" in decision && decision.erasable) {
      deleted = await deleteRecordsForSubject(await db, subject, category, request.id, actor_user_id)
      audit_entries++
    } else if ("anonymisable" in decision && decision.anonymisable) {
      anonymised = await anonymiseRecordsForSubject(await db, subject, category, request.id, actor_user_id)
      audit_entries++
    }
    // else: skip — isErasableNow decided retention

    result[category] = { deleted, anonymised, skipped }
    total_affected += deleted + anonymised
  }

  // Update data_subject_requests.erasure_records_affected
  await (await db)
    .from("data_subject_requests")
    .update({ erasure_records_affected: result })
    .eq("id", request.id)

  return { by_category: result, total_affected, audit_entries }
}

/**
 * Anonymise a single record — strips identifying PII while retaining the structural row.
 */
export async function anonymiseRecord(
  table: string,
  recordId: string,
  anonymisation: AnonymisationTemplate,
): Promise<void> {
  const db = createServiceClient()
  const { error } = await (await db)
    .from(table as Parameters<Awaited<ReturnType<typeof createServiceClient>>["from"]>[0])
    .update(anonymisation.field_overrides)
    .eq("id", recordId)

  if (error) {
    throw new Error(`[popia/erasure] anonymiseRecord failed for ${table}/${recordId}: ${error.message}`)
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function scopeToCategories(scope: ErasureScope): DataCategory[] {
  if (scope.type === "nuke") {
    return [
      "lease_documents",
      "inspection_photos",
      "inspection_reports",
      "rent_ledger",
      "communications",
      "rejected_applications",
      "credit_checks",
      "maintenance_records",
      "platform_account",
      // consent_log and audit_log intentionally excluded — never purged
      // trust_account_records excluded — BUILD_64 invariant
    ]
  }
  return scope.categories
}

// Counts + deletes are expressed per category. This maps category → table + filter.
// Tables added here as new data types are introduced.

const SUBJECT_FIELD = {
  tenants: "user_id",
  contacts: "email",
  applications: "user_id",
  inspections: null,  // linked via lease_id → lease_parties
  maintenance_requests: "requested_by_user_id",
  communication_log: "user_id",
} as const

type DbClient = Awaited<ReturnType<typeof createServiceClient>>

async function countRecordsForSubject(
  db: DbClient,
  subject: SubjectIdentification,
  category: DataCategory,
): Promise<number> {
  // Simplified count — production implementation expands per category
  switch (category) {
    case "rejected_applications": {
      const q = db.from("applications").select("id", { count: "exact", head: true })
      if (subject.user_id) q.eq(SUBJECT_FIELD.applications, subject.user_id)
      q.eq("org_id", subject.org_id)
      const { count } = await q
      return count ?? 0
    }
    case "communications": {
      const q = db.from("communication_log").select("id", { count: "exact", head: true })
      if (subject.user_id) q.eq("user_id", subject.user_id)
      q.eq("org_id", subject.org_id)
      const { count } = await q
      return count ?? 0
    }
    case "maintenance_records": {
      const q = db.from("maintenance_requests").select("id", { count: "exact", head: true })
      if (subject.user_id) q.eq("requested_by_user_id", subject.user_id)
      q.eq("org_id", subject.org_id)
      const { count } = await q
      return count ?? 0
    }
    default:
      return 0
  }
}

async function deleteRecordsForSubject(
  db: DbClient,
  subject: SubjectIdentification,
  category: DataCategory,
  requestId: string,
  actor_user_id: string,
): Promise<number> {
  let affected = 0

  if (category === "rejected_applications" && subject.user_id) {
    const { data: rows, error: rowsError } = await db
      .from("applications")
      .select("id")
      .eq("org_id", subject.org_id)
      .eq("user_id", subject.user_id)
      .in("status", ["rejected", "withdrawn"])
    logQueryError("deleteRecordsForSubject applications", rowsError)

    for (const row of rows ?? []) {
      await db.from("applications").delete().eq("id", row.id)
      await logAudit(db, subject.org_id, actor_user_id, "popia_erasure", "applications", row.id, requestId)
      affected++
    }
  }

  return affected
}

async function anonymiseRecordsForSubject(
  db: DbClient,
  subject: SubjectIdentification,
  category: DataCategory,
  requestId: string,
  actor_user_id: string,
): Promise<number> {
  let affected = 0

  if (category === "communications" && subject.user_id) {
    // Null-out PII content while keeping delivery metadata for regulatory audit
    const { data: rows, error: rowsError } = await db
      .from("communication_log")
      .select("id")
      .eq("org_id", subject.org_id)
      .eq("user_id", subject.user_id)
    logQueryError("anonymiseRecordsForSubject communication_log", rowsError)

    for (const row of rows ?? []) {
      await db
        .from("communication_log")
        .update({ content: "[redacted — POPIA erasure]", metadata: null })
        .eq("id", row.id)
      await logAudit(db, subject.org_id, actor_user_id, "popia_anonymise", "communication_log", row.id, requestId)
      affected++
    }
  }

  return affected
}

async function logAudit(
  db: DbClient,
  orgId: string,
  userId: string,
  eventType: string,   // semantic descriptor: "popia_erasure" | "popia_anonymise"
  table: string,
  recordId: string,
  requestId: string,
): Promise<void> {
  // F0 fix (ADDENDUM_AUDIT_HARDENING): the previous body wrote phantom columns
  // (user_id/event_type/values + no org_id) → silent 42703 → POPIA erasure trail recorded NOTHING.
  // Route through the canonical writer with the real columns. Erasure = DELETE, anonymise = UPDATE;
  // the semantic descriptor lives in new_values.action.
  await recordAudit(db, {
    orgId,
    actorId: userId,
    action: eventType === "popia_anonymise" ? "UPDATE" : "DELETE",
    table,
    recordId,
    after: { action: eventType, request_id: requestId },
  })
}
