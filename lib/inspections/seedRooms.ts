import { SupabaseClient } from "@supabase/supabase-js"
import {
  getRoomSuggestions,
  getItemsForRoomType,
  injectFurnishingItems,
  type UnitContext,
  type RoomSuggestion,
} from "@/lib/inspections/templateEngine"

/**
 * Seeds inspection_rooms + inspection_items in two batched inserts.
 * Idempotent — no-ops if rooms already exist.
 *
 * Room source priority (when unitId is supplied):
 *   1. Unit has an inspection profile → use profile rooms + templateEngine item banks
 *   2. Unit has unit_type set         → generate via templateEngine
 *   3. Neither                        → legacy flat template fallback
 *
 * Furnished / semi-furnished units get extra "(furnished)" item entries injected
 * into matching rooms via injectFurnishingItems().
 */
export async function seedInspectionRooms(
  db: SupabaseClient,
  inspectionId: string,
  orgId: string,
  leaseType: string,
  unitId?: string,
): Promise<void> {
  // Guard: skip if already seeded
  const { count } = await db
    .from("inspection_rooms")
    .select("id", { count: "exact", head: true })
    .eq("inspection_id", inspectionId)
  if ((count ?? 0) > 0) return

  let rooms: RoomSuggestion[]

  if (unitId) {
    // Fetch unit context and existing profile in parallel
    const [{ data: unit }, { data: profile }] = await Promise.all([
      db.from("units")
        .select("unit_type, bedrooms, bathrooms, features, furnishing_status")
        .eq("id", unitId)
        .single(),
      db.from("unit_inspection_profiles")
        .select("unit_inspection_profile_rooms(room_type, label, sort_order)")
        .eq("unit_id", unitId)
        .maybeSingle(),
    ])

    const unitContext: UnitContext | undefined = unit
      ? {
          unit_type: unit.unit_type,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          features: unit.features as string[] | null,
        }
      : undefined

    type ProfileRoom = { room_type: string; label: string; sort_order: number }
    const profileRooms = profile?.unit_inspection_profile_rooms as ProfileRoom[] | null | undefined

    if (profileRooms && profileRooms.length > 0) {
      // Profile-first: use saved room structure, look up item banks by room type
      rooms = [...profileRooms]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((pr) => ({
          type: pr.room_type,
          label: pr.label,
          items: getItemsForRoomType(pr.room_type),
        }))
    } else {
      // No profile — generate fresh from templateEngine (uses unit_type if set)
      rooms = getRoomSuggestions(leaseType, unitContext)
    }

    // Inject landlord-owned items for furnished / semi-furnished units
    const furnishingStatus = unit?.furnishing_status ?? null
    if (furnishingStatus && furnishingStatus !== "unfurnished") {
      const { data: furnishings } = await db
        .from("unit_furnishings")
        .select("category, item_name")
        .eq("unit_id", unitId)
      if (furnishings?.length) {
        rooms = injectFurnishingItems(rooms, furnishings)
      }
    }
  } else {
    // No unit context at all — legacy fallback (pre-57A units)
    rooms = getRoomSuggestions(leaseType)
  }

  // Batch 1: insert all rooms
  const { data: roomRecords, error: roomErr } = await db
    .from("inspection_rooms")
    .insert(
      rooms.map((room, i) => ({
        org_id: orgId,
        inspection_id: inspectionId,
        room_type: room.type,
        room_label: room.label,
        display_order: i,
      }))
    )
    .select("id, room_type")

  if (roomErr || !roomRecords?.length) {
    if (roomErr) console.error("[seedRooms] rooms insert error", roomErr.message)
    return
  }

  // Batch 2: items — index-matched to rooms array (same insertion order)
  const itemRows: {
    org_id: string
    inspection_id: string
    room_id: string
    item_name: string
    item_category: string
    display_order: number
  }[] = []

  roomRecords.forEach((roomRecord, idx) => {
    const items = rooms[idx]?.items ?? []
    items.forEach((name, j) => {
      itemRows.push({
        org_id: orgId,
        inspection_id: inspectionId,
        room_id: roomRecord.id,
        item_name: name,
        item_category: "other",
        display_order: j,
      })
    })
  })

  if (itemRows.length > 0) {
    const { error: itemErr } = await db.from("inspection_items").insert(itemRows)
    if (itemErr) console.error("[seedRooms] items insert error", itemErr.message)
  }
}
