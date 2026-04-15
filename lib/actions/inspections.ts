"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { seedInspectionRooms } from "@/lib/inspections/seedRooms"

export async function createInspection(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const unitId = formData.get("unit_id") as string
  const propertyId = formData.get("property_id") as string
  const leaseId = formData.get("lease_id") as string || null
  const tenantId = formData.get("tenant_id") as string || null
  const inspectionType = formData.get("inspection_type") as string
  const leaseType = formData.get("lease_type") as string || "residential"
  const scheduledDate = formData.get("scheduled_date") as string || null

  const { data: inspection, error } = await db
    .from("inspections")
    .insert({
      org_id: orgId,
      unit_id: unitId,
      property_id: propertyId,
      lease_id: leaseId,
      tenant_id: tenantId,
      inspection_type: inspectionType,
      lease_type: leaseType,
      scheduled_date: scheduledDate,
      status: "scheduled",
      conducted_by: userId,
    })
    .select("id")
    .single()

  if (error || !inspection) {
    return { error: error?.message || "Failed to create inspection" }
  }

  await seedInspectionRooms(db, inspection.id, orgId, leaseType)

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "inspections",
    record_id: inspection.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { inspection_type: inspectionType, lease_type: leaseType, unit_id: unitId },
  })

  revalidatePath("/inspections")
  redirect(`/inspections/${inspection.id}`)
}

export async function updateInspectionStatus(inspectionId: string, newStatus: string) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId } = gw

  const { data: inspection } = await db
    .from("inspections")
    .select("org_id, lease_type, status")
    .eq("id", inspectionId)
    .single()

  if (!inspection) return { error: "Inspection not found" }

  const updates: Record<string, unknown> = { status: newStatus }

  if (newStatus === "completed" && inspection.lease_type === "residential") {
    const now = new Date()
    const closeDate = new Date(now)
    closeDate.setDate(closeDate.getDate() + 7)
    updates.status = "awaiting_tenant_review"
    updates.dispute_window_open = true
    updates.dispute_window_opened_at = now.toISOString()
    updates.dispute_window_closes_at = closeDate.toISOString()
  }

  if (newStatus === "completed" && inspection.lease_type === "commercial") {
    updates.conducted_date = new Date().toISOString()
  }

  if (newStatus === "in_progress") {
    updates.conducted_date = new Date().toISOString()
    // Lazy seed: covers inspections created outside createInspection()
    await seedInspectionRooms(db, inspectionId, inspection.org_id, inspection.lease_type ?? "residential")
  }

  await db.from("inspections").update(updates).eq("id", inspectionId)

  await db.from("audit_log").insert({
    org_id: inspection.org_id,
    table_name: "inspections",
    record_id: inspectionId,
    action: "UPDATE",
    changed_by: userId,
    new_values: updates,
  })

  revalidatePath(`/inspections/${inspectionId}`)
  return { success: true }
}

export async function updateItemCondition(
  itemId: string,
  inspectionId: string,
  condition: string,
  notes?: string
) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db } = gw

  await db.from("inspection_items").update({
    condition,
    condition_notes: notes || null,
  }).eq("id", itemId)

  revalidatePath(`/inspections/${inspectionId}`)
  return { success: true }
}
