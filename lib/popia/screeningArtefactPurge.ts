/**
 * lib/popia/screeningArtefactPurge.ts — F-3: the single 90-day declined-applicant PII purge
 *
 * Auth:   service-role only (called from the daily cron — fires regardless of subscription state)
 * Data:   applications + its identity/contact child tables (application_co_applicants, application_directors,
 *         application_guarantors, application_tokens, application_screening_payments, consent_verifications)
 *         — column strip of ALL declined PII (identity + financial + derived), DERIVED from the erasure plan
 *         (DECLINED_APPLICANT_STRIP_GROUPS) so it can't drift; plus application_screening_lines,
 *         application_bank_statement_classifications, application_prescreens, screening_artifacts — whole-row
 *         deletes + their Storage objects (screening-reports, bank-statements, identity-docs, application-docs).
 *         NB: consent_verifications is HELD out of the AUTO purge pending counsel (AUTO_PURGE_EXCLUDED_TABLES);
 *         the DSAR erasure path still strips it.
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
 *
 *         LITIGATION-HOLD GATE (F3 amendment §4): before any strip, the sweep resolves the subject's
 *         auth_user_id and calls claimApplicantPurgeSlot — an active hold on the application/subject, or an
 *         unresolvable subject, defers the row (skipped_on_hold) and records a structured skip audit. This
 *         is the fail-closed deploy gate; it does NOT yet implement the Q1(b-lite) two-tier retained-record
 *         split (that wiring waits on the F3-amendment reconciliation — decided_* columns + compliance sweep).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordAudit } from "@/lib/audit/recordAudit"
import { logQueryError } from "@/lib/supabase/logQueryError"
import {
  DECLINED_APPLICANT_STRIP_GROUPS,
  DECLINED_APPLICANT_DELETE_TABLES,
} from "./anonymisePlan"
import { stripGroup } from "./anonymiseIdentity"
import { claimApplicantPurgeSlot, resolveSubjectAuthUserId } from "./applicantPurgeGate"

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
  /** Fail-closed litigation-hold gate (ADDENDUM_F3 §4): active hold on the application/subject, or the
   *  subject's auth_user_id can't be resolved (subject_missing) — the row is left for the next sweep. */
  skipped_on_hold: number
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
 * those tables, (4) remove the raw bank statement + identity-docs Storage, (4b) remove guarantor-agreement
 * files (application-docs), (5) strip ALL declined PII columns across the application + its identity/contact
 * child tables (plan-derived strip groups, shared stripGroup engine; ANY group erroring aborts before the
 * latch — V4), (6) stamp pii_purged_at (only after the strip provably ran), (7) one audit row.
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
        .map((r) => { const v = r[pathColumn]; return typeof v === "string" ? v : null })
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

  // (4b) the declined application's guarantor-agreement PDF(s) (identity + signature) → application-docs
  // bucket (the application-document bucket, app/api/applications/[id]/documents/upload). The column is
  // currently UNWRITTEN — the guarantor-agreement upload feature isn't built — so this is a defensive
  // no-op today; it covers the file the moment that feature lands. CD F3 ruling: no retention basis once declined.
  const { data: guarantorRows, error: guarantorErr } = await db
    .from("application_guarantors")
    .select("guarantor_agreement_path")
    .eq("application_id", applicationId)
    .eq("org_id", orgId)
  logQueryError("purgeApplicationScreeningArtefacts application_guarantors guarantor_agreement_path", guarantorErr)
  const guarantorPaths = ((guarantorRows ?? []) as unknown as Array<Record<string, unknown>>)
    .map((r) => { const v = r.guarantor_agreement_path; return typeof v === "string" ? v : null })
  await removeStorageObjects(db, "application-docs", guarantorPaths)

  // (5) strip ALL declined PII columns across the application AND its identity/contact child tables.
  // Replays the SAME stripGroup engine the DSAR erasure uses over DECLINED_APPLICANT_STRIP_GROUPS (derived
  // from the erasure plan — can't drift). single = applicationId resolves every group's key (applications.id,
  // co_applicants.primary_application_id, *.application_id all equal it). stripGroup self-heals 23502 and
  // returns the rows it touched.
  let applicationStripped = false
  for (const group of DECLINED_APPLICANT_STRIP_GROUPS) {
    const affected = await stripGroup(db, group, applicationId, [])
    if (affected < 0) {
      // V4: a non-self-healed strip error on ANY group (incl. a child identity table where 0-rows is
      // normal and would otherwise hide the error) must abort BEFORE the one-way pii_purged_at latch —
      // never stamp/audit "purged in full" with that subject's id_number still alive. Thrown → recorded in
      // the orchestrator's result.errors; the candidate is re-evaluated next run (deletes are idempotent).
      throw new Error(`strip failed for group ${group.id} (${group.table}) on application ${applicationId} — pii_purged_at NOT stamped`)
    }
    if (group.table === "applications") applicationStripped = affected > 0
  }
  // The applications row provably exists (it IS the candidate) — a 0 there (vs the -1 error above) is an
  // anomaly, not a DB error. Do NOT stamp the one-way latch; that would assert a "purged" the row isn't.
  if (!applicationStripped) {
    console.error(`[screeningArtefactPurge] applications strip matched no row for ${applicationId} — not stamping pii_purged_at`)
    return false
  }

  // (6) stamp the idempotency marker — only after the identity strip provably ran.
  const { error: markErr } = await db
    .from("applications")
    .update({ pii_purged_at: now.toISOString() })
    .eq("id", applicationId)
    .eq("org_id", orgId)
  if (markErr) {
    console.error(`[screeningArtefactPurge] marker stamp failed for ${applicationId}:`, markErr.message)
    return false
  }

  // (7) one audit row per purged application — UPDATE (the row is stripped, child artefacts deleted),
  // fully attributed (system actor). The payload asserts the REAL strip set so "purged in full" is true.
  await recordAudit(db, {
    orgId,
    actorId: null,
    action: "UPDATE",
    table: "applications",
    recordId: applicationId,
    after: {
      action: "declined_applicant_purge",
      tier: "declined_90d",
      deleted_tables: DECLINED_APPLICANT_DELETE_TABLES.map((t) => t.table),
      stripped_groups: DECLINED_APPLICANT_STRIP_GROUPS.map((g) => ({ table: g.table, fields: Object.keys(g.fields) })),
      storage_buckets: ["screening-reports", "bank-statements", "identity-docs", "application-docs"],
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
    evaluated: 0, purged: 0, skipped_not_eligible: 0, skipped_already_purged: 0, skipped_on_hold: 0, errors: [],
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

/**
 * Record a litigation-hold purge-skip as a structured audit event (no PII — application_id + reason only),
 * so an Information Officer can review which declined rows the sweep deferred and why.
 * NB: emitted each sweep a row remains held; de-duping repeat skips is a flagged follow-up.
 */
async function recordPurgeSkip(
  db: SupabaseClient,
  orgId: string,
  applicationId: string,
  reason: "hold_active_application" | "hold_active_subject" | "subject_missing",
): Promise<void> {
  await recordAudit(db, {
    orgId,
    actorId: null,
    action: "UPDATE",
    table: "applications",
    recordId: applicationId,
    after: { action: "declined_purge_skipped", reason },
  })
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

  // Litigation-hold gate (fail-closed) — BEFORE the would-purge count so a held row never counts as
  // purgeable. An active hold on the application OR the subject, or an unresolvable subject, defers the row.
  const subjectAuthUserId = await resolveSubjectAuthUserId(db, appRow.tenant_id)
  const slot = await claimApplicantPurgeSlot(db, { applicationId: appRow.id, subjectAuthUserId })
  if (!slot.ok) {
    result.skipped_on_hold++
    if (!dryRun) await recordPurgeSkip(db, appRow.org_id, appRow.id, slot.reason)
    return
  }

  if (dryRun) { result.purged++; return }   // would-purge count, no deletion
  try {
    const did = await purgeApplicationScreeningArtefacts(db, appRow, now)
    if (did) result.purged++
    else result.skipped_not_eligible++
  } catch (err) {
    result.errors.push(`${appRow.id}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
