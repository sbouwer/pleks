"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { getRoomTemplate, getItemsForRoom } from "@/lib/inspections/roomTemplates"

export async function createInspection(formData: FormData) {
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

  const unitId = formData.get("unit_id") as string
  const propertyId = formData.get("property_id") as string
  const leaseId = formData.get("lease_id") as string || null
  const tenantId = formData.get("tenant_id") as string || null
  const inspectionType = formData.get("inspection_type") as string
  const leaseType = formData.get("lease_type") as string || "residential"
  const scheduledDate = formData.get("scheduled_date") as string || null

  const { data: inspection, error } = await supabase
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
      conducted_by: user.id,
    })
    .select("id")
    .single()

  if (error || !inspection) {
    return { error: error?.message || "Failed to create inspection" }
  }

  // Pre-populate rooms from template
  const rooms = getRoomTemplate(leaseType)
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i]
    const { data: roomRecord } = await supabase
      .from("inspection_rooms")
      .insert({
        org_id: orgId,
        inspection_id: inspection.id,
        room_type: room.type,
        room_label: room.label,
        display_order: i,
      })
      .select("id")
      .single()

    if (!roomRecord) continue

    // Pre-populate items for this room
    const items = getItemsForRoom(leaseType, room.type)
    for (let j = 0; j < items.length; j++) {
      await supabase.from("inspection_items").insert({
        org_id: orgId,
        inspection_id: inspection.id,
        room_id: roomRecord.id,
        item_name: items[j],
        item_category: "other",
        display_order: j,
      })
    }
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "inspections",
    record_id: inspection.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: { inspection_type: inspectionType, lease_type: leaseType, unit_id: unitId },
  })

  revalidatePath("/inspections")
  redirect(`/inspections/${inspection.id}`)
}

export async function updateInspectionStatus(inspectionId: string, newStatus: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: inspection } = await supabase
    .from("inspections")
    .select("org_id, lease_type, status")
    .eq("id", inspectionId)
    .single()

  if (!inspection) return { error: "Inspection not found" }

  const updates: Record<string, unknown> = { status: newStatus }

  // If completing a residential inspection, open dispute window
  if (newStatus === "completed" && inspection.lease_type === "residential") {
    const now = new Date()
    const closeDate = new Date(now)
    closeDate.setDate(closeDate.getDate() + 7)

    updates.status = "awaiting_tenant_review"
    updates.dispute_window_open = true
    updates.dispute_window_opened_at = now.toISOString()
    updates.dispute_window_closes_at = closeDate.toISOString()
  }

  // Commercial: skip dispute window, go straight to completed
  if (newStatus === "completed" && inspection.lease_type === "commercial") {
    updates.conducted_date = new Date().toISOString()
  }

  if (newStatus === "in_progress") {
    updates.conducted_date = new Date().toISOString()
  }

  await supabase.from("inspections").update(updates).eq("id", inspectionId)

  await supabase.from("audit_log").insert({
    org_id: inspection.org_id,
    table_name: "inspections",
    record_id: inspectionId,
    action: "UPDATE",
    changed_by: user.id,
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  await supabase.from("inspection_items").update({
    condition,
    condition_notes: notes || null,
  }).eq("id", itemId)

  revalidatePath(`/inspections/${inspectionId}`)
  return { success: true }
}
