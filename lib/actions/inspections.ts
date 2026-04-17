"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { seedInspectionRooms } from "@/lib/inspections/seedRooms"
import { saveProfileFromInspection } from "@/lib/inspections/profileHelpers"

// Inspection types that require a saved profile before they can be created
const PROFILE_REQUIRED_TYPES = ["move_in", "move_out", "periodic"]

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

  // Hard gate: move_in / move_out / periodic require an existing profile
  if (PROFILE_REQUIRED_TYPES.includes(inspectionType) && leaseType === "residential") {
    const { count, error: profileCheckErr } = await db
      .from("unit_inspection_profiles")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)

    if (profileCheckErr) {
      console.error("createInspection profile check:", profileCheckErr.message)
    }

    if ((count ?? 0) === 0) {
      return { error: "no_profile" }
    }
  }

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

  // Seed rooms — pass unitId so the engine uses profile-first logic
  await seedInspectionRooms(db, inspection.id, orgId, leaseType, unitId)

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
    .select("org_id, lease_type, status, inspection_type, unit_id")
    .eq("id", inspectionId)
    .single()

  if (!inspection) return { error: "Inspection not found" }

  const updates: Record<string, unknown> = { status: newStatus }

  // Residential non-pre_listing → open dispute window instead of going straight to completed
  if (
    newStatus === "completed" &&
    inspection.lease_type === "residential" &&
    inspection.inspection_type !== "pre_listing"
  ) {
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
    await seedInspectionRooms(
      db,
      inspectionId,
      inspection.org_id,
      inspection.lease_type ?? "residential",
      inspection.unit_id ?? undefined,
    )
  }

  await db.from("inspections").update(updates).eq("id", inspectionId)

  // Pre-listing completion: save the inspector's room list as the unit's profile
  if (newStatus === "completed" && inspection.inspection_type === "pre_listing" && inspection.unit_id) {
    await saveProfileFromInspection(db, inspectionId, inspection.unit_id, inspection.org_id)
  }

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
