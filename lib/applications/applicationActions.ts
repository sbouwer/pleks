"use server"

/**
 * Server actions for application status changes.
 * Each action: updates DB + sends the corresponding email.
 * Called from ApplicationActions.tsx (client component).
 */

import { createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { buildEmailContext } from "./buildEmailContext"
import {
  sendDeclinedStage1,
  sendApproved,
  sendDeclinedStage2,
} from "./emails"

export async function declineStage1Action(applicationId: string) {
  const service = await createServiceClient()

  const { error } = await service
    .from("applications")
    .update({ stage1_status: "not_shortlisted", not_shortlisted_reason: "Declined by agent" })
    .eq("id", applicationId)

  if (error) return { error: error.message }

  // Send Email 5: Not shortlisted
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) await sendDeclinedStage1(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {})
  } catch (e) { console.error("sendDeclinedStage1 failed:", e) }

  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}

export async function approveAction(applicationId: string, agentId: string, tenantId: string) {
  const service = await createServiceClient()

  const { error } = await service
    .from("applications")
    .update({
      stage2_status: "approved",
      reviewed_by: agentId,
      reviewed_at: new Date().toISOString(),
      tenant_id: tenantId,
    })
    .eq("id", applicationId)

  if (error) return { error: error.message }

  // Send Email 8: Approved
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) await sendApproved(ctx.appSummary, ctx.listingSummary, ctx.orgContext)
  } catch (e) { console.error("sendApproved failed:", e) }

  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}

export async function declineStage2Action(applicationId: string) {
  const service = await createServiceClient()

  const { error } = await service
    .from("applications")
    .update({
      stage2_status: "declined",
      decline_reason: "Declined after screening",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", applicationId)

  if (error) return { error: error.message }

  // Send Email 9: Declined after screening
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) await sendDeclinedStage2(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {})
  } catch (e) { console.error("sendDeclinedStage2 failed:", e) }

  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}
