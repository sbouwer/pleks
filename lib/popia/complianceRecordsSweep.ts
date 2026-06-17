/**
 * lib/popia/complianceRecordsSweep.ts — F3 5-year compliance-records sweep (F3_SPEC_AMENDMENT §6.5)
 *
 * Auth:   service-role only (daily cron). Fires regardless of subscription state.
 * Data:   applications (Tier-2 decision-accountability columns), consent_verifications (contact PII).
 * Notes:  The 5-YEAR tier of the two-tier model. The 90-day raw purge (screeningArtefactPurge) strips the
 *         raw screening data and keeps the Tier-2 accountability record; THIS sweep strips that record at
 *         5 years (declined_decision_record) and the consent contact-PII at 5 years (consent_proof), via
 *         the SAME stripGroup engine. Both categories are hold-gated through claimApplicantPurgeSlot — an
 *         active hold on the application or subject suspends the strip (counsel: defence evidence survives
 *         while a dispute is live). Retention windows are the SSOT in retention.ts (60 months each).
 *
 *         IDEMPOTENT BY CONSTRUCTION: the strip nulls the very columns the candidate query filters on —
 *         decided_at (declined) and target_email/target_phone_e164 (consent) — so a swept row drops out of
 *         the candidate set on the next run. No marker column needed. Audit + count only when a strip ran.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { stripGroup } from "./anonymiseIdentity"
import { claimApplicantPurgeSlot, resolveSubjectAuthUserId } from "./applicantPurgeGate"
import { F3_TIER_2_FINAL_STRIP_COLUMNS, type AnonymiseGroup } from "./anonymisePlan"
import { recordAudit } from "@/lib/audit/recordAudit"
import { logQueryError } from "@/lib/supabase/logQueryError"

const FIVE_YEARS_MS = 5 * 365 * 86_400_000

/** Build a column-null strip group keyed by the row's own id. */
function nullStripGroup(id: string, table: string, cols: readonly string[]): AnonymiseGroup {
  return {
    id, table, keyColumn: "id", keyFrom: "applicationId", appliesTo: ["applicant"],
    fields: Object.fromEntries(cols.map((c) => [c, null])),
  }
}

const DECLINED_STRIP = nullStripGroup("F3.5y.declined_decision_record", "applications", F3_TIER_2_FINAL_STRIP_COLUMNS)
const CONSENT_STRIP = nullStripGroup("F3.5y.consent_proof", "consent_verifications", ["target_email", "target_phone_e164"])

interface CategoryResult { swept: number; skipped_on_hold: number; errors: string[] }
export interface SweepResult { declined_decision_record: CategoryResult; consent_proof: CategoryResult }

const newCat = (): CategoryResult => ({ swept: 0, skipped_on_hold: 0, errors: [] })

/** Resolve the subject's auth_user_id from an application id (for the consent_proof gate). */
async function subjectForApplication(db: SupabaseClient, applicationId: string | null): Promise<string | null> {
  if (!applicationId) return null
  const { data, error } = await db.from("applications").select("tenant_id").eq("id", applicationId).maybeSingle()
  logQueryError("complianceRecordsSweep applications.tenant_id", error)
  return resolveSubjectAuthUserId(db, (data?.tenant_id as string | null) ?? null)
}

/** Record a single 5y strip as a structured audit event (no PII — category + record id only). */
async function auditSwept(db: SupabaseClient, orgId: string, table: string, recordId: string, category: string): Promise<void> {
  await recordAudit(db, {
    orgId, actorId: null, action: "UPDATE", table, recordId,
    after: { action: "compliance_records_swept", category },
  })
}

/**
 * Gate (fail-closed) → strip → audit one candidate, folding the outcome into the running category result.
 * `recordId` is the row the strip targets; `applicationId`/`subjectAuthUserId` drive the hold-check.
 */
async function processCandidate(
  db: SupabaseClient,
  args: {
    applicationId: string; subjectAuthUserId: string | null;
    strip: AnonymiseGroup; recordId: string; orgId: string; table: string; category: string;
  },
  cat: CategoryResult,
): Promise<void> {
  try {
    const slot = await claimApplicantPurgeSlot(db, { applicationId: args.applicationId, subjectAuthUserId: args.subjectAuthUserId })
    if (!slot.ok) { cat.skipped_on_hold++; return }
    const affected = await stripGroup(db, args.strip, args.recordId, [])
    if (affected < 0) { cat.errors.push(`strip ${args.recordId}`); return }
    if (affected > 0) {
      await auditSwept(db, args.orgId, args.table, args.recordId, args.category)
      cat.swept++
    }
  } catch (e) {
    cat.errors.push(`${args.recordId}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** declined_decision_record: null the Tier-2 accountability columns on declined applications past 5y. */
async function sweepDeclined(db: SupabaseClient, cutoff: string, cat: CategoryResult): Promise<void> {
  const { data, error } = await db
    .from("applications")
    .select("id, org_id, tenant_id")
    .not("decided_at", "is", null)
    .lt("decided_at", cutoff)
    .or("stage2_status.in.(declined,withdrawn),stage1_status.eq.not_shortlisted")
  if (error) { cat.errors.push(`fetch: ${error.message}`); return }
  for (const row of (data ?? []) as Array<{ id: string; org_id: string; tenant_id: string | null }>) {
    const subjectAuthUserId = await resolveSubjectAuthUserId(db, row.tenant_id)
    await processCandidate(db, {
      applicationId: row.id, subjectAuthUserId, strip: DECLINED_STRIP,
      recordId: row.id, orgId: row.org_id, table: "applications", category: "declined_decision_record",
    }, cat)
  }
}

/** consent_proof: strip the consent-challenge contact PII past 5y (the consent event row persists). */
async function sweepConsentProof(db: SupabaseClient, cutoff: string, cat: CategoryResult): Promise<void> {
  const { data, error } = await db
    .from("consent_verifications")
    .select("id, org_id, application_id")
    .lt("created_at", cutoff)
    .or("target_email.not.is.null,target_phone_e164.not.is.null")
  if (error) { cat.errors.push(`fetch: ${error.message}`); return }
  for (const row of (data ?? []) as Array<{ id: string; org_id: string; application_id: string | null }>) {
    const subjectAuthUserId = await subjectForApplication(db, row.application_id)
    await processCandidate(db, {
      applicationId: row.application_id ?? "", subjectAuthUserId, strip: CONSENT_STRIP,
      recordId: row.id, orgId: row.org_id, table: "consent_verifications", category: "consent_proof",
    }, cat)
  }
}

/**
 * The daily 5-year sweep. Both categories fail-closed on an active hold (skipped_on_hold) and are
 * idempotent (swept rows drop out of the candidate predicate). Returns per-category counts.
 */
export async function complianceRecordsSweep(db: SupabaseClient, now: Date = new Date()): Promise<SweepResult> {
  const cutoff = new Date(now.getTime() - FIVE_YEARS_MS).toISOString()
  const result: SweepResult = { declined_decision_record: newCat(), consent_proof: newCat() }
  await sweepDeclined(db, cutoff, result.declined_decision_record)
  await sweepConsentProof(db, cutoff, result.consent_proof)
  return result
}
