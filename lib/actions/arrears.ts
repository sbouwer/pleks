"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function updateArrearsStatus(
  caseId: string,
  newStatus: string,
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const updates: Record<string, unknown> = { status: newStatus }

  if (newStatus === "resolved") {
    updates.resolved_at = new Date().toISOString()
    updates.resolved_by = user.id
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

  const { error } = await supabase.from("arrears_cases").update(updates).eq("id", caseId)
  if (error) return { error: error.message }

  const { data: arrearsCase } = await supabase.from("arrears_cases").select("org_id").eq("id", caseId).single()

  if (arrearsCase) {
    // Log action
    await supabase.from("arrears_actions").insert({
      org_id: arrearsCase.org_id,
      case_id: caseId,
      action_type: "status_change",
      subject: `Status changed to ${newStatus}`,
      body: notes || null,
    })

    await supabase.from("audit_log").insert({
      org_id: arrearsCase.org_id,
      table_name: "arrears_cases",
      record_id: caseId,
      action: "UPDATE",
      changed_by: user.id,
      new_values: updates,
    })
  }

  revalidatePath("/payments/arrears")
  return { success: true }
}

export async function recordPaymentArrangement(
  caseId: string,
  formData: FormData
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const amountCents = Math.round(parseFloat(formData.get("amount") as string) * 100)
  const startDate = formData.get("start_date") as string
  const endDate = formData.get("end_date") as string || null
  const notes = formData.get("notes") as string || null

  const { error } = await supabase.from("arrears_cases").update({
    status: "payment_arrangement",
    arrangement_amount_cents: amountCents,
    arrangement_start_date: startDate,
    arrangement_end_date: endDate,
    arrangement_notes: notes,
    sequence_paused: true,
    sequence_paused_reason: "Payment arrangement in place",
  }).eq("id", caseId)

  if (error) return { error: error.message }

  const { data: arrearsCase } = await supabase.from("arrears_cases").select("org_id").eq("id", caseId).single()

  if (arrearsCase) {
    await supabase.from("arrears_actions").insert({
      org_id: arrearsCase.org_id,
      case_id: caseId,
      action_type: "payment_arrangement",
      subject: "Payment arrangement recorded",
      body: `R${(amountCents / 100).toFixed(0)}/month from ${startDate}${notes ? `. ${notes}` : ""}`,
    })
  }

  revalidatePath("/payments/arrears")
  return { success: true }
}
