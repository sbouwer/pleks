"use server"

/**
 * Server actions for application status changes.
 * Each action: updates DB + sends the corresponding email.
 * Called from ApplicationActions.tsx (client component).
 */

import { gateway } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"
import { recordAudit } from "@/lib/audit/recordAudit"
import { revalidatePath } from "next/cache"
import { buildEmailContext } from "./buildEmailContext"
import {
  sendDeclinedStage1,
  sendApproved,
  sendDeclinedStage2,
} from "./emails"

// Agent application decisions: org-scoped (gateway) + audited (ADDENDUM_AUDIT_HARDENING). gateway()
// yields the same service-role db plus the actor + org, so these gain a who/when trail and an org filter.

export async function declineStage1Action(applicationId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Unauthorized" }
  if (!(await hasCapability(gw, "applications"))) return { error: "Applications access is required." }
  const { db, userId, orgId } = gw

  const { error } = await db
    .from("applications")
    .update({ stage1_status: "not_shortlisted", not_shortlisted_reason: "Declined by agent" })
    .eq("id", applicationId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "applications", recordId: applicationId,
    after: { action: "application_declined_stage1", reason: "Declined by agent" },
  })

  // Send Email 5: Not shortlisted
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

  const { error } = await db
    .from("applications")
    .update({
      stage2_status: "approved",
      reviewed_by: agentId,
      reviewed_at: new Date().toISOString(),
      tenant_id: tenantId,
    })
    .eq("id", applicationId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "applications", recordId: applicationId,
    after: { action: "application_approved", tenant_id: tenantId },
  })

  // Send Email 8: Approved
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) await sendApproved(ctx.appSummary, ctx.listingSummary, ctx.orgContext)
  } catch (e) { console.error("sendApproved failed:", e) }

  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}

export async function declineStage2Action(applicationId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Unauthorized" }
  if (!(await hasCapability(gw, "applications"))) return { error: "Applications access is required." }
  const { db, userId, orgId } = gw

  const { error } = await db
    .from("applications")
    .update({
      stage2_status: "declined",
      decline_reason: "Declined after screening",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "applications", recordId: applicationId,
    after: { action: "application_declined_stage2", reason: "Declined after screening" },
  })

  // Send Email 9: Declined after screening
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) await sendDeclinedStage2(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {})
  } catch (e) { console.error("sendDeclinedStage2 failed:", e) }

  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}
