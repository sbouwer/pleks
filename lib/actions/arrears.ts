"use server"

/**
 * lib/actions/arrears.ts — arrears case server actions (status transitions + payment arrangements)
 *
 * Auth:   requireAgentWriteAccess + the 'finance' capability (RBAC P4; owner/is_admin exempt)
 * Data:   arrears_cases, arrears_actions, audit_log via gateway db
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { hasCapability } from "@/lib/auth/can"
import { revalidatePath } from "next/cache"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function updateArrearsStatus(
  caseId: string,
  newStatus: string,
  notes?: string
) {
  const gw = await requireAgentWriteAccess("update_arrears_status")
  if (!(await hasCapability(gw, "finance"))) return { error: "Finance access is required for arrears actions." }
  const { db, userId, orgId } = gw

  const updates: Record<string, unknown> = { status: newStatus }

  if (newStatus === "resolved") {
    updates.resolved_at = new Date().toISOString()
    updates.resolved_by = userId
    updates.resolution_notes = notes || null
  }

  if (newStatus === "payment_arrangement") {
    updates.sequence_paused = true
    updates.sequence_paused_reason = "Payment arrangement in place"
  }

  if (newStatus === "legal") {
    updates.referred_to_attorney = true
    updates.referred_at = new Date().toISOString()
  }

  // Org-scope guard (caller-ID census): the service client bypasses RLS, so a foreign caseId must
  // match no row on the update AND the follow-up read (which gates the audit/action writes).
  const { error } = await db.from("arrears_cases").update(updates).eq("id", caseId).eq("org_id", orgId)
  if (error) return { error: error.message }

  const { data: arrearsCase, error: arrearsCaseError } = await db.from("arrears_cases").select("org_id").eq("id", caseId).eq("org_id", orgId).single()
    logQueryError("updateArrearsStatus arrears_cases", arrearsCaseError)

  if (arrearsCase) {
    // Log action
    await db.from("arrears_actions").insert({
      org_id: arrearsCase.org_id,
      case_id: caseId,
      action_type: "status_change",
      subject: `Status changed to ${newStatus}`,
      body: notes || null,
    })

    await db.from("audit_log").insert({
      org_id: arrearsCase.org_id,
      table_name: "arrears_cases",
      record_id: caseId,
      action: "UPDATE",
      changed_by: userId,
      new_values: updates,
    })
  }

  revalidatePath("/billing/arrears")
  return { success: true }
}

export async function recordPaymentArrangement(
  caseId: string,
  formData: FormData
) {
  const gw = await requireAgentWriteAccess("record_payment_arrangement")
  if (!(await hasCapability(gw, "finance"))) return { error: "Finance access is required for arrears actions." }
  const { db, orgId } = gw

  const amountCents = Math.round(parseFloat(formData.get("amount") as string) * 100)
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string || null
  const notes = formData.get("notes") as string || null

  const { error } = await db.from("arrears_cases").update({
    status: "payment_arrangement",
    arrangement_amount_cents: amountCents,
    arrangement_start_date: startDate,
    arrangement_end_date: endDate,
    arrangement_notes: notes,
    sequence_paused: true,
    sequence_paused_reason: "Payment arrangement in place",
  }).eq("id", caseId).eq("org_id", orgId)

  if (error) return { error: error.message }

  const { data: arrearsCase, error: arrearsCaseError } = await db.from("arrears_cases").select("org_id").eq("id", caseId).eq("org_id", orgId).single()
    logQueryError("recordPaymentArrangement arrears_cases", arrearsCaseError)

  if (arrearsCase) {
    await db.from("arrears_actions").insert({
      org_id: arrearsCase.org_id,
      case_id: caseId,
      action_type: "payment_arrangement",
      subject: "Payment arrangement recorded",
      body: `R${(amountCents / 100).toFixed(0)}/month from ${startDate}${notes ? `. ${notes}` : ""}`,
    })
  }

  revalidatePath("/billing/arrears")
  return { success: true }
}
