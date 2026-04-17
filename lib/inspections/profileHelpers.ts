import { SupabaseClient } from "@supabase/supabase-js"

/**
 * Copies a completed inspection's rooms into the unit's inspection profile.
 * Called when a pre_listing inspection is marked complete — the inspector has
 * walked the unit and the resulting room list becomes the permanent profile
 * for all future move-in / periodic / move-out inspections.
 *
 * Idempotent — upserts the profile row and replaces all room rows.
 */
export async function saveProfileFromInspection(
  db: SupabaseClient,
  inspectionId: string,
  unitId: string,
  orgId: string,
): Promise<void> {
  // Read the rooms the inspector created during this inspection
  const { data: rooms, error: roomsErr } = await db
    .from("inspection_rooms")
    .select("room_type, room_label, display_order")
    .eq("inspection_id", inspectionId)
    .order("display_order")

  if (roomsErr) {
    console.error("[profileHelpers] rooms fetch error", roomsErr.message)
    return
  }
  if (!rooms || rooms.length === 0) return

  // Upsert the profile header (one per unit)
  const { data: profile, error: profileErr } = await db
    .from("unit_inspection_profiles")
    .upsert(
      { org_id: orgId, unit_id: unitId, updated_at: new Date().toISOString() },
      { onConflict: "unit_id" },
    )
    .select("id")
    .single()

  if (profileErr || !profile) {
    console.error("[profileHelpers] profile upsert error", profileErr?.message)
    return
  }

  // Replace all room rows — delete existing, insert from inspection
  await db
    .from("unit_inspection_profile_rooms")
    .delete()
    .eq("profile_id", profile.id)

  const { error: insertErr } = await db
    .from("unit_inspection_profile_rooms")
    .insert(
      rooms.map((r, i) => ({
        org_id: orgId,
        profile_id: profile.id,
        room_type: r.room_type,
        label: r.room_label,
        sort_order: i,
        is_custom: false,
      }))
    )

  if (insertErr) {
    console.error("[profileHelpers] room rows insert error", insertErr.message)
  }
}
