"use server"

/**
 * lib/applications/applicationActions.ts — server actions for application status changes
 *
 * Auth:   gateway() — org-scoped + audited; capability "applications" required
 * Data:   applications (decision columns + F3 decision-accountability), screening_policies, audit_log, emails
 * Notes:  F3 round-4 write-path. Every terminal decision now records the counsel-signed decision-reason
 *         code(s), the deciding capacity, the active screening-policy version, the per-decision ratios, and
 *         an audit backlink — the 5-year decision-accountability record. decided_at/by/stage populate via
 *         the sync_decision_columns_on_stage_write trigger from the prescreened and reviewed stamps.
 *         Stage-1 not-shortlist = a light NOT_SHORTLISTED code; stage-2 decline = the full
 *         defence-load-bearing path (codes + adverse factors + ratios + agent-discretion controls 1-3).
 */
import { gateway } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"
import { recordAudit, recordAuditReturningId } from "@/lib/audit/recordAudit"
import { revalidatePath } from "next/cache"
import { INCOME_AFFORDABILITY_THRESHOLD } from "@/lib/constants"
import { resolveActiveScreeningPolicy } from "@/lib/screening/screeningPolicy"
import {
  validateDeclineDecision,
  extractDecisionRatios,
  isDiscretionDecline,
  DEFAULT_DECIDING_AGENT_CAPACITY,
  type DeclineDecisionInput,
} from "@/lib/screening/recordDecision"
import type { NotShortlistedReasonCode } from "@/lib/screening/decisionReasons"
import type { ComponentSnapshot } from "@/lib/screening/fitScoreEngine.v1"
import { buildEmailContext } from "./buildEmailContext"
import {
  sendDeclinedStage1,
  sendApproved,
  sendDeclinedStage2,
} from "./emails"

const NOW = () => new Date().toISOString()

export async function declineStage1Action(
  applicationId: string,
  notShortlistedReasonCode: NotShortlistedReasonCode = "not_shortlisted_other_applicant_selected",
) {
  const gw = await gateway()
  if (!gw) return { error: "Unauthorized" }
  if (!(await hasCapability(gw, "applications"))) return { error: "Applications access is required." }
  const { db, userId, orgId } = gw

  // The terminal decision is at the prescreen stage; the audit anchors decided_* (via trigger) + the purge.
  const policy = await resolveActiveScreeningPolicy(db, orgId)
  const auditId = await recordAuditReturningId(db, {
    orgId, actorId: userId, action: "UPDATE", table: "applications", recordId: applicationId,
    after: { action: "application_not_shortlisted", not_shortlisted_reason_code: notShortlistedReasonCode },
  })

  const { error } = await db
    .from("applications")
    .update({
      stage1_status: "not_shortlisted",
      not_shortlisted_reason_code: notShortlistedReasonCode,
      prescreened_by: userId,
      prescreened_at: NOW(),
      deciding_agent_capacity: DEFAULT_DECIDING_AGENT_CAPACITY,
      screening_policy_id: policy?.id ?? null,
      screening_policy_version: policy?.version ?? null,
      audit_log_decision_entry_id: auditId,
    })
    .eq("id", applicationId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  // Email 5: Not shortlisted (neutral — no reason disclosed to the applicant)
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) await sendDeclinedStage1(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {})
  } catch (e) { console.error("sendDeclinedStage1 failed:", e) }

  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}

export async function approveAction(applicationId: string, agentId: string, tenantId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Unauthorized" }
  if (!(await hasCapability(gw, "applications"))) return { error: "Applications access is required." }
  const { db, userId, orgId } = gw

  const policy = await resolveActiveScreeningPolicy(db, orgId)
  const auditId = await recordAuditReturningId(db, {
    orgId, actorId: userId, action: "UPDATE", table: "applications", recordId: applicationId,
    after: { action: "application_approved", tenant_id: tenantId },
  })

  const { error } = await db
    .from("applications")
    .update({
      stage2_status: "approved",
      reviewed_by: agentId,
      reviewed_at: NOW(),
      tenant_id: tenantId,
      deciding_agent_capacity: DEFAULT_DECIDING_AGENT_CAPACITY,
      screening_policy_id: policy?.id ?? null,
      screening_policy_version: policy?.version ?? null,
      audit_log_decision_entry_id: auditId,
    })
    .eq("id", applicationId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  // Email 8: Approved
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) await sendApproved(ctx.appSummary, ctx.listingSummary, ctx.orgContext)
  } catch (e) { console.error("sendApproved failed:", e) }

  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}

/**
 * Stage-2 decline — the defence-load-bearing path. Records the counsel-signed decline-reason code,
 * contributing adverse factors, the agent-discretion explanation (when applicable), per-decision ratios,
 * active screening-policy version, and an audit backlink. Agent-discretion declines also write a dedicated
 * AGENT_DISCRETION_DECLINE audit row (control 3) — the code only, never the free-text (no PII in audit_log).
 */
export async function declineStage2Action(applicationId: string, decision: DeclineDecisionInput & { capacity?: typeof DEFAULT_DECIDING_AGENT_CAPACITY }) {
  const gw = await gateway()
  if (!gw) return { error: "Unauthorized" }
  if (!(await hasCapability(gw, "applications"))) return { error: "Applications access is required." }
  const { db, userId, orgId } = gw

  const invalid = validateDeclineDecision(decision)
  if (invalid) return { error: invalid.message }

  // Read the persisted FitScore snapshot for ratio extraction (the figures the agent saw at decision time).
  const { data: appRow, error: readErr } = await db
    .from("applications")
    .select("fitscore_component_snapshot")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .single()
  if (readErr) return { error: readErr.message }

  const policy = await resolveActiveScreeningPolicy(db, orgId)
  const ratios = extractDecisionRatios(
    (appRow?.fitscore_component_snapshot ?? null) as ComponentSnapshot | null,
    INCOME_AFFORDABILITY_THRESHOLD,   // v0 policy == the platform constant; wire through policy.policy when authoring lands
  )
  const discretionText = isDiscretionDecline(decision.declineReasonCode) ? (decision.declineReasonText ?? "").trim() : null

  const auditId = await recordAuditReturningId(db, {
    orgId, actorId: userId, action: "UPDATE", table: "applications", recordId: applicationId,
    after: { action: "application_declined_stage2", decline_reason_code: decision.declineReasonCode, adverse_factor_codes: decision.adverseFactorCodes ?? [] },
  })

  const { error } = await db
    .from("applications")
    .update({
      stage2_status: "declined",
      reviewed_by: userId,
      reviewed_at: NOW(),
      decline_reason_code: decision.declineReasonCode,
      adverse_factor_codes: decision.adverseFactorCodes ?? null,
      decline_reason_text: discretionText,
      deciding_agent_capacity: decision.capacity ?? DEFAULT_DECIDING_AGENT_CAPACITY,
      screening_policy_id: policy?.id ?? null,
      screening_policy_version: policy?.version ?? null,
      audit_log_decision_entry_id: auditId,
      ...ratios,
    })
    .eq("id", applicationId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  // Control 3: a dedicated audit row surfacing every use of the agent-discretion code (code only — no PII).
  if (discretionText) {
    await recordAudit(db, {
      orgId, actorId: userId, action: "UPDATE", table: "applications", recordId: applicationId,
      after: { action: "AGENT_DISCRETION_DECLINE", decline_reason_code: decision.declineReasonCode },
    })
  }

  // Email 9: Declined after screening (neutral — no reason disclosed to the applicant)
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) await sendDeclinedStage2(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {})
  } catch (e) { console.error("sendDeclinedStage2 failed:", e) }

  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}
