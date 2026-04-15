import { SupabaseClient } from "@supabase/supabase-js"
import { getRoomTemplate, getItemsForRoom } from "@/lib/inspections/roomTemplates"

/**
 * Inserts inspection_rooms + inspection_items from the lease-type template.
 * Idempotent when count = 0 check is done by the caller; safe to call unconditionally
 * on new inspections since duplicates are prevented by the caller's insert path.
 */
export async function seedInspectionRooms(
  db: SupabaseClient,
  inspectionId: string,
  orgId: string,
  leaseType: string,
): Promise<void> {
  const rooms = getRoomTemplate(leaseType)
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i]
    const { data: roomRecord } = await db
      .from("inspection_rooms")
      .insert({ org_id: orgId, inspection_id: inspectionId, room_type: room.type, room_label: room.label, display_order: i })
      .select("id")
      .single()
    if (!roomRecord) continue
    const items = getItemsForRoom(leaseType, room.type)
    for (let j = 0; j < items.length; j++) {
      await db.from("inspection_items").insert({
        org_id: orgId, inspection_id: inspectionId, room_id: roomRecord.id,
        item_name: items[j], item_category: "other", display_order: j,
      })
    }
  }
}
