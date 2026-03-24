"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { triageMaintenanceRequest } from "@/lib/ai/maintenanceTriage"

export async function createMaintenanceRequest(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")
  const orgId = membership.org_id

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const unitId = formData.get("unit_id") as string
  const propertyId = formData.get("property_id") as string
  const tenantId = formData.get("tenant_id") as string || null
  const leaseId = formData.get("lease_id") as string || null

  // AI triage
  const triage = await triageMaintenanceRequest(title, description)

  // Generate work order number
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)

  const seq = ((count || 0) + 1).toString().padStart(4, "0")
  const workOrderNumber = `WO-${year}-${seq}`

  const { data: request, error } = await supabase
    .from("maintenance_requests")
    .insert({
      org_id: orgId,
      unit_id: unitId,
      property_id: propertyId,
      lease_id: leaseId,
      tenant_id: tenantId,
      title,
      description,
      logged_by: "agent",
      logged_by_user: user.id,
      category: triage.category,
      urgency: triage.urgency,
      ai_triage_notes: triage.urgency_reason,
      ai_triage_at: new Date().toISOString(),
      work_order_number: workOrderNumber,
      access_instructions: formData.get("access_instructions") as string || null,
      special_instructions: formData.get("special_instructions") as string || null,
      estimated_cost_cents: formData.get("estimated_cost")
        ? Math.round(parseFloat(formData.get("estimated_cost") as string) * 100)
        : null,
      status: "pending_review",
    })
    .select("id")
    .single()

  if (error || !request) {
    return { error: error?.message || "Failed to create request" }
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_requests",
    record_id: request.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: { title, category: triage.category, urgency: triage.urgency },
  })

  revalidatePath("/maintenance")
  redirect(`/maintenance/${request.id}`)
}

export async function updateMaintenanceStatus(
  requestId: string,
  newStatus: string,
  notes?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const updates: Record<string, unknown> = { status: newStatus }

  if (newStatus === "approved") {
    updates.reviewed_by = user.id
    updates.reviewed_at = new Date().toISOString()
  }

  if (newStatus === "completed") {
    updates.completed_at = new Date().toISOString()
    updates.agent_signoff_at = new Date().toISOString()
    updates.agent_signoff_by = user.id
  }

  if (newStatus === "rejected") {
    updates.reviewed_by = user.id
    updates.reviewed_at = new Date().toISOString()
    updates.rejection_reason = notes || null
  }

  const { error } = await supabase
    .from("maintenance_requests")
    .update(updates)
    .eq("id", requestId)

  if (error) return { error: error.message }

  const { data: req } = await supabase
    .from("maintenance_requests")
    .select("org_id")
    .eq("id", requestId)
    .single()

  if (req) {
    await supabase.from("audit_log").insert({
      org_id: req.org_id,
      table_name: "maintenance_requests",
      record_id: requestId,
      action: "UPDATE",
      changed_by: user.id,
      new_values: updates,
    })
  }

  revalidatePath(`/maintenance/${requestId}`)
  revalidatePath("/maintenance")
  return { success: true }
}
