import { SupabaseClient } from "@supabase/supabase-js"
import { getRoomTemplate, getItemsForRoom } from "@/lib/inspections/roomTemplates"

/**
 * Seeds inspection_rooms + inspection_items in two batched inserts.
 * Idempotent — no-ops if rooms already exist.
 * ~2 round-trips regardless of template size.
 */
export async function seedInspectionRooms(
  db: SupabaseClient,
  inspectionId: string,
  orgId: string,
  leaseType: string,
): Promise<void> {
  // Guard: skip if already seeded
  const { count } = await db
    .from("inspection_rooms")
    .select("id", { count: "exact", head: true })
    .eq("inspection_id", inspectionId)

  if ((count ?? 0) > 0) return

  const roomTemplate = getRoomTemplate(leaseType)

  // Batch 1: insert all rooms
  const { data: roomRecords, error: roomErr } = await db
    .from("inspection_rooms")
    .insert(
      roomTemplate.map((room, i) => ({
        org_id: orgId,
        inspection_id: inspectionId,
        room_type: room.type,
        room_label: room.label,
        display_order: i,
      }))
    )
    .select("id, room_type")

  if (roomErr || !roomRecords?.length) return

  // Batch 2: build all item rows, insert in one shot
  const itemRows: {
    org_id: string
    inspection_id: string
    room_id: string
    item_name: string
    item_category: string
    display_order: number
  }[] = []

  for (const roomRecord of roomRecords) {
    getItemsForRoom(leaseType, roomRecord.room_type).forEach((name, j) => {
      itemRows.push({
        org_id: orgId,
        inspection_id: inspectionId,
        room_id: roomRecord.id,
        item_name: name,
        item_category: "other",
        display_order: j,
      })
    })
  }

  if (itemRows.length > 0) {
    await db.from("inspection_items").insert(itemRows)
  }
}
