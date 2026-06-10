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
 *         executeErasure() is NOT a single transaction — PostgREST has no multi-statement txn. The
 *         §7 identity strip runs per-group (anonymiseIdentity.ts) and is idempotent + drift-self-healing
 *         (R-4) + completed-group-tracked (R-3); safe to re-run to completion. (Prior header claimed a
 *         "single RPC transaction" — false for this path; corrected.)
 */
import { createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { isErasableNow, type DataCategory } from "./retention"
import type { DataSubjectRequest } from "./requests"
import {
  resolveSubject, executeIdentityAnonymise, subjectTypeFromRole, MANUAL_REVIEW_TARGETS,
  type ResolvedSubject,
} from "./anonymiseIdentity"
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
  const db = await createServiceClient()
  const subject: SubjectIdentification = {
    user_id: request.subject_user_id ?? undefined,
    email: request.subject_email,
    org_id: request.org_id,
  }

  // D-14: supplier (deferred from v1, §7.2) or an unresolvable role → manual admin handling.
  // POPIA's ~30-day window means we can't refuse a lawful request just because automation isn't
  // built; record it for a human and return cleanly — never error, never silently no-op.
  const subjectType = subjectTypeFromRole(request.subject_role_context)
  if (subjectType === "supplier" || subjectType === null) {
    const reason = subjectType === "supplier"
      ? "Supplier erasure is deferred from v1 automation (§7.2) — handle manually within the SLA."
      : "Subject role not auto-resolvable — handle manually within the SLA."
    await db.from("data_subject_requests").update({
      erasure_records_affected: { manual_handling: true, reason, manual_review: MANUAL_REVIEW_TARGETS },
    }).eq("id", request.id)
    return { by_category: {} as ErasureResult["by_category"], total_affected: 0, audit_entries: 0 }
  }

  // §7 (D-5) identity anonymise — strip the contact shell + every denormalised PII copy for the subject.
  const resolved = await resolveSubject(db, {
    org_id: request.org_id, user_id: request.subject_user_id, email: request.subject_email,
  })

  // P-1: purge the bank-statement + screening PDFs from Storage BEFORE the strip redacts their path columns
  // (the files are out-of-band; the plan only redacts the DB *_path values). File-then-redact.
  await purgeSubjectScreeningStorage(db, resolved, request.id, actor_user_id)

  const identity = await executeIdentityAnonymise(db, resolved, subjectType, request.id, actor_user_id)

  // Category-gated FULL-ROW deletes (retention permitting). The cron does the routine purges; this
  // handles a record that's already past its window at erasure time. Currently rejected_applications.
  const scope: ErasureScope = request.request_type === "nuke"
    ? { type: "nuke", acknowledged_carveouts: (request.request_scope?.acknowledged_carveouts as AcknowledgedCarveout[]) ?? [] }
    : { type: "targeted", categories: (request.request_scope?.categories as DataCategory[]) ?? [] }

  const result: ErasureResult["by_category"] = {} as ErasureResult["by_category"]
  let total_affected = identity.total
  let audit_entries = identity.groups.length

  for (const category of scopeToCategories(scope)) {
    const decision = await isErasableNow(category, { orgId: request.org_id, created_at: new Date() })
    let deleted = 0
    if ("erasable" in decision && decision.erasable) {
      deleted = await deleteRecordsForSubject(db, subject, resolved, category, request.id, actor_user_id)
      if (deleted > 0) audit_entries++
    }
    result[category] = { deleted, anonymised: 0, skipped: 0 }
    total_affected += deleted
  }

  await db.from("data_subject_requests").update({
    erasure_records_affected: { categories: result, identity_groups: identity.groups, manual_review: MANUAL_REVIEW_TARGETS },
  }).eq("id", request.id)

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

type DbClient = Awaited<ReturnType<typeof createServiceClient>>

async function deleteRecordsForSubject(
  db: DbClient,
  subject: SubjectIdentification,
  resolved: ResolvedSubject,
  category: DataCategory,
  requestId: string,
  actor_user_id: string,
): Promise<number> {
  let affected = 0

  // rejected_applications: full-row delete of the subject's rejected/withdrawn applications.
  // applications key on tenant_id (no user_id), and rejection lives in stage1/stage2_status — the
  // prior stub filtered phantom `user_id` + `status` columns and silently no-op'd.
  if (category === "rejected_applications" && resolved.applicationIds.length > 0) {
    const { data: rows, error: rowsError } = await db
      .from("applications")
      .select("id, stage1_status, stage2_status")
      .in("id", resolved.applicationIds)
    logQueryError("deleteRecordsForSubject applications", rowsError)

    for (const row of rows ?? []) {
      const rejected = row.stage1_status === "not_shortlisted" || row.stage2_status === "declined"
      if (!rejected) continue
      await db.from("applications").delete().eq("id", row.id).eq("org_id", subject.org_id)
      await logAudit(db, subject.org_id, actor_user_id, "popia_erasure", "applications", row.id as string, requestId)
      affected++
    }
  }

  return affected
}

/**
 * P-1: delete the Storage objects holding the subject's bank-statement + screening PDFs. The plan redacts the
 * *_path DB columns; the referenced files are out-of-band and must be removed here, BEFORE the strip overwrites
 * those paths. Best-effort + audited (one row per bucket touched). Mirrors the property-documents file-then-row
 * purge. screening_artifacts (immutable-by-RLS) is NOT touched here — it's flagged for manual review.
 */
async function purgeSubjectScreeningStorage(
  db: DbClient,
  resolved: ResolvedSubject,
  requestId: string,
  actor_user_id: string,
): Promise<void> {
  if (resolved.applicationIds.length === 0) return

  const remove = async (bucket: string, table: string, paths: Array<string | null>): Promise<void> => {
    const files = [...new Set(paths.filter((p): p is string => !!p))]
    if (files.length === 0) return
    const { error } = await db.storage.from(bucket).remove(files)
    if (error) { console.error(`[popia/erasure] storage purge ${bucket} failed:`, error.message); return }
    await logAudit(db, resolved.orgId, actor_user_id, "popia_erasure", table, resolved.applicationIds[0], requestId)
  }

  const { data: bsc, error: bscErr } = await db
    .from("application_bank_statement_classifications")
    .select("bank_statement_doc_path")
    .in("application_id", resolved.applicationIds)
  logQueryError("purgeSubjectScreeningStorage bank_statement_classifications", bscErr)
  await remove("bank-statements", "application_bank_statement_classifications",
    (bsc ?? []).map((r) => r.bank_statement_doc_path as string | null))

  const { data: lines, error: linesErr } = await db
    .from("application_screening_lines")
    .select("pdf_storage_path")
    .in("application_id", resolved.applicationIds)
  logQueryError("purgeSubjectScreeningStorage application_screening_lines", linesErr)
  await remove("screening-reports", "application_screening_lines",
    (lines ?? []).map((r) => r.pdf_storage_path as string | null))
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
