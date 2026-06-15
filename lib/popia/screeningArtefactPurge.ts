/**
 * lib/popia/screeningArtefactPurge.ts — F-3: the single 90-day declined-applicant PII purge
 *
 * Auth:   service-role only (called from the daily cron — fires regardless of subscription state)
 * Data:   applications (read terminal state + pii_purged_at; null ALL declined PII columns —
 *         identity + financial + screening artefacts), application_screening_lines,
 *         application_bank_statement_classifications, application_prescreens, screening_artifacts
 *         — whole-row deletes + their Storage objects (screening-reports, bank-statements, identity-docs).
 * Notes:  SINGLE 90-day retention tier (ADDENDUM_70H F3 — reworked from a two-tier draft, and folding in
 *         the retired lib/rules/application/rejected-applicant-purge.ts). A declined / not_shortlisted /
 *         withdrawn application's PII purges in FULL at 90 days — identity (id_number, employer_name…),
 *         financial PII, AND the screening artefacts (bureau/AI/bank-statement evidence). There is NO
 *         separate 12-month identity tier. This matches the public PAIA Manual + credit-check-policy 90-day
 *         commitment and the behaviour the old OrgRule already shipped.
 *
 *         IDEMPOTENCY MARKER: pii_purged_at (the pre-existing column; the two-tier draft's
 *         screening_purged_at was dropped). The purge skips any row where pii_purged_at IS NOT NULL.
 *
 *         IRREVERSIBLE — guard hard. purgeApplicationScreeningArtefacts asserts, per application:
 *           (1) it is in a NON-CONVERTED TERMINAL state (declined stage1+2 / not_shortlisted / withdrawn),
 *           (2) its terminal-transition date is ≥ 90 days ago (day precision),
 *           (3) it is NOT already purged (pii_purged_at IS NULL — idempotent skip),
 *         BEFORE deleting anything. countEligibleScreeningArtefacts is the non-destructive dry-run.
 *
 *         REUSES the erasure pipeline rather than re-deriving it (locked decision #2): the column-set +
 *         delete-tables + Storage buckets come from anonymisePlan.ts (the SSOT), and the file-then-row
 *         Storage purge mirrors erasure.ts purgeSubjectScreeningStorage.
 *
 *         TERMINAL-DATE ANCHOR (day precision): stage2 declined/withdrawn → reviewed_at; stage1
 *         not_shortlisted → prescreened_at; both fall back to updated_at if the specific stamp is null.
 *         CONVERTED = stage2_status 'approved' (mutually exclusive with the purge targets; see isConverted).
 *         A dedicated terminal_at anchor is a flagged follow-up, not this change.
 *
 *         SCOPE NOTE: declined + not_shortlisted are the published PAIA "rejected" commitment. withdrawn is
 *         extra hygiene (applicant-initiated, no retention basis) — NOT part of the published commitment.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordAudit } from "@/lib/audit/recordAudit"
import { logQueryError } from "@/lib/supabase/logQueryError"
import {
  DECLINED_APPLICANT_PURGE_COLUMNS,
  DECLINED_APPLICANT_DELETE_TABLES,
} from "./anonymisePlan"

const NINETY_DAYS_MS = 90 * 86_400_000

/** Stage-2 terminal states that are non-converted (declined after screening, withdrawn by applicant). */
const STAGE2_TERMINAL = new Set(["declined", "withdrawn"])
/** Stage-1 terminal state (not shortlisted by agent). */
const STAGE1_TERMINAL = "not_shortlisted"

/** Columns the purge reads to decide eligibility. Keep aligned with the guards below. */
const ELIGIBILITY_SELECT =
  "id, org_id, stage1_status, stage2_status, tenant_id, reviewed_at, prescreened_at, updated_at, pii_purged_at"

interface ApplicationRow {
  id: string
  org_id: string
  stage1_status: string | null
  stage2_status: string | null
  tenant_id: string | null
  reviewed_at: string | null
  prescreened_at: string | null
  updated_at: string | null
  pii_purged_at: string | null
}

export interface ScreeningArtefactPurgeResult {
  evaluated: number
  purged: number
  skipped_not_eligible: number
  skipped_already_purged: number
  errors: string[]
}

/**
 * An application is CONVERTED if it was approved at stage 2 — never purge those.
 * NB: there is no FK between `applications` and `leases` in the schema (verified 2026-06-15), so
 * `stage2_status = 'approved'` is the only conversion signal on the row. This is sound because the
 * terminal states the purge targets (declined / withdrawn / not_shortlisted) are mutually exclusive
 * with 'approved' in the same status column — an approved application is never also a purge candidate.
 */
function isConverted(row: ApplicationRow): boolean {
  return row.stage2_status === "approved"
}

/** Is the application in a non-converted TERMINAL state? (declined stage1+2 / not_shortlisted / withdrawn) */
function isNonConvertedTerminal(row: ApplicationRow): boolean {
  if (isConverted(row)) return false
  if (row.stage2_status !== null && STAGE2_TERMINAL.has(row.stage2_status)) return true
  return row.stage1_status === STAGE1_TERMINAL
}

/**
 * The date the application ENTERED its terminal state (day precision). stage2 declined/withdrawn is stamped
 * on reviewed_at; stage1 not_shortlisted on prescreened_at. Falls back to updated_at when the specific
 * stamp is missing (older rows). Returns null only if no usable date exists (then it's NOT eligible — fail safe).
 */
function terminalDate(row: ApplicationRow): Date | null {
  let raw: string | null = null
  if (row.stage2_status !== null && STAGE2_TERMINAL.has(row.stage2_status)) {
    raw = row.reviewed_at ?? row.updated_at
  } else if (row.stage1_status === STAGE1_TERMINAL) {
    raw = row.prescreened_at ?? row.updated_at
  }
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** HARD guard: returns true only when it is safe to irreversibly purge this application's PII. */
export function isScreeningArtefactPurgeable(row: ApplicationRow, now: Date): boolean {
  if (row.pii_purged_at !== null) return false              // idempotent — already purged
  if (!isNonConvertedTerminal(row)) return false            // converted or not terminal → never
  const anchor = terminalDate(row)
  if (!anchor) return false                                 // can't date the transition → fail safe
  return now.getTime() - anchor.getTime() >= NINETY_DAYS_MS // ≥ 90 days (day precision via ms math)
}

/**
 * Fetch the org's candidate terminal applications (the pre-filter the DB can do). The fine-grained guard
 * (isScreeningArtefactPurgeable) is then applied in TS — this is the SINGLE place the candidate query
 * lives, so the dry-run count and the executor can never drift apart. Returns the typed rows + any error.
 */
async function fetchPurgeCandidates(
  db: SupabaseClient,
  orgId: string,
  now: Date,
): Promise<{ rows: ApplicationRow[]; error: string | null }> {
  const cutoff = new Date(now.getTime() - NINETY_DAYS_MS).toISOString()
  const { data, error } = await db
    .from("applications")
    .select(ELIGIBILITY_SELECT)
    .eq("org_id", orgId)
    .is("pii_purged_at", null)
    .or(
      `and(stage2_status.eq.declined,reviewed_at.lt.${cutoff}),` +
      `and(stage2_status.eq.withdrawn,reviewed_at.lt.${cutoff}),` +
      `and(stage1_status.eq.not_shortlisted,prescreened_at.lt.${cutoff})`,
    )
  logQueryError("fetchPurgeCandidates applications", error)
  const rows = (data ?? []) as unknown as ApplicationRow[]
  return { rows, error: error?.message ?? null }
}

/**
 * NON-DESTRUCTIVE dry-run: how many of an org's applications are eligible for the 90-day declined purge.
 * Mirrors the executor's filter exactly so the count cannot drift from what the purge would do.
 */
export async function countEligibleScreeningArtefacts(
  db: SupabaseClient,
  orgId: string,
  now: Date = new Date(),
): Promise<number> {
  const { rows } = await fetchPurgeCandidates(db, orgId, now)
  return rows.filter((r) => isScreeningArtefactPurgeable(r, now)).length
}

/**
 * Remove Storage objects best-effort (file-then-row), de-duplicated. Mirrors erasure.ts.
 */
async function removeStorageObjects(
  db: SupabaseClient,
  bucket: string,
  paths: Array<string | null>,
): Promise<void> {
  const files = [...new Set(paths.filter((p): p is string => !!p))]
  if (files.length === 0) return
  const { error } = await db.storage.from(bucket).remove(files)
  if (error) console.error(`[screeningArtefactPurge] storage purge ${bucket} failed:`, error.message)
}

/**
 * IRREVERSIBLE: purge ONE declined application's PII. Re-asserts the guard before deleting (defence in
 * depth — never trust the caller's filter). Returns true iff it purged (false = guard rejected / no-op).
 *
 * Order: (1) re-assert guard, (2) delete Storage files referenced by each delete-table, (3) whole-row delete
 * those tables, (4) remove the raw bank statement + identity-docs Storage, (5) null ALL declined PII columns
 * + stamp pii_purged_at, (6) one audit row.
 */
export async function purgeApplicationScreeningArtefacts(
  db: SupabaseClient,
  row: ApplicationRow,
  now: Date,
): Promise<boolean> {
  if (!isScreeningArtefactPurgeable(row, now)) return false
  const { id: applicationId, org_id: orgId } = row

  // (2)+(3) per delete-table: remove the Storage file(s), then the rows. Keyed by application_id + org_id.
  for (const t of DECLINED_APPLICANT_DELETE_TABLES) {
    const pathColumn = t.storagePathColumn
    if (pathColumn && t.storageBucket) {
      const { data: pathRows, error: pathErr } = await db
        .from(t.table)
        .select(pathColumn)
        .eq("application_id", applicationId)
        .eq("org_id", orgId)
      logQueryError(`purgeApplicationScreeningArtefacts select ${t.table}`, pathErr)
      const paths = ((pathRows ?? []) as unknown as Array<Record<string, unknown>>)
        .map((r) => (typeof r[pathColumn] === "string" ? (r[pathColumn] as string) : null))
      await removeStorageObjects(db, t.storageBucket, paths)
    }
    const { error: delErr } = await db
      .from(t.table)
      .delete()
      .eq("application_id", applicationId)
      .eq("org_id", orgId)
    logQueryError(`purgeApplicationScreeningArtefacts delete ${t.table}`, delErr)
  }

  // (4) the raw Stage-1 bank statement file (bank-statements) + identity docs (identity-docs). The
  // identity-docs path convention is `${org_id}/${application_id}` (folded from the retired OrgRule).
  const { data: appFile, error: appFileErr } = await db
    .from("applications")
    .select("bank_statement_path")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .maybeSingle()
  logQueryError("purgeApplicationScreeningArtefacts applications bank_statement_path", appFileErr)
  const bankStatementPath = typeof appFile?.bank_statement_path === "string" ? appFile.bank_statement_path : null
  await removeStorageObjects(db, "bank-statements", [bankStatementPath])
  await removeStorageObjects(db, "identity-docs", [`${orgId}/${applicationId}`])

  // (5) null ALL declined PII columns (identity + financial + screening artefacts) + stamp the marker.
  const { error: stripErr } = await db
    .from("applications")
    .update({ ...DECLINED_APPLICANT_PURGE_COLUMNS, pii_purged_at: now.toISOString() })
    .eq("id", applicationId)
    .eq("org_id", orgId)
  if (stripErr) {
    console.error(`[screeningArtefactPurge] strip failed for ${applicationId}:`, stripErr.message)
    return false
  }

  // (6) one audit row per purged application — IRREVERSIBLE action, fully attributed (system actor).
  await recordAudit(db, {
    orgId,
    actorId: null,
    action: "DELETE",
    table: "applications",
    recordId: applicationId,
    after: {
      action: "declined_applicant_purge",
      tier: "declined_90d",
      tables: DECLINED_APPLICANT_DELETE_TABLES.map((t) => t.table),
      application_columns_stripped: Object.keys(DECLINED_APPLICANT_PURGE_COLUMNS),
    },
  })

  return true
}

/**
 * Org-scoped orchestrator: purge every eligible declined application's PII for one org.
 * `dryRun` returns the count without deleting (the count/dry-run path).
 */
export async function purgeScreeningArtefactsForOrg(
  db: SupabaseClient,
  orgId: string,
  now: Date = new Date(),
  options: { dryRun?: boolean } = {},
): Promise<ScreeningArtefactPurgeResult> {
  const result: ScreeningArtefactPurgeResult = {
    evaluated: 0, purged: 0, skipped_not_eligible: 0, skipped_already_purged: 0, errors: [],
  }

  const { rows, error } = await fetchPurgeCandidates(db, orgId, now)
  if (error) {
    result.errors.push(`fetch: ${error}`)
    return result
  }

  for (const appRow of rows) {
    result.evaluated++
    await purgeOneIntoResult(db, appRow, now, options.dryRun ?? false, result)
  }

  return result
}

/** Classify + (unless dry-run) purge a single candidate, folding the outcome into the running result. */
async function purgeOneIntoResult(
  db: SupabaseClient,
  appRow: ApplicationRow,
  now: Date,
  dryRun: boolean,
  result: ScreeningArtefactPurgeResult,
): Promise<void> {
  if (appRow.pii_purged_at !== null) { result.skipped_already_purged++; return }
  if (!isScreeningArtefactPurgeable(appRow, now)) { result.skipped_not_eligible++; return }
  if (dryRun) { result.purged++; return }   // would-purge count, no deletion
  try {
    const did = await purgeApplicationScreeningArtefacts(db, appRow, now)
    if (did) result.purged++
    else result.skipped_not_eligible++
  } catch (err) {
    result.errors.push(`${appRow.id}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
