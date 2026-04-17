"use server"

import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"
import { getRoomSuggestions, type UnitContext } from "@/lib/inspections/templateEngine"

/**
 * Generates an inspection profile for a unit from its type, bedroom count,
 * and feature flags — without requiring a physical inspection.
 *
 * Safe to call multiple times: upserts the profile header and replaces rooms.
 * Used by the "Set up from template" button on the unit detail page.
 */
export async function setupProfileFromTemplate(
  unitId: string,
  propertyId: string,
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  // Verify ownership + fetch unit context in one query
  const { data: unit, error: unitErr } = await db
    .from("units")
    .select("unit_type, bedrooms, bathrooms, features, property_id")
    .eq("id", unitId)
    .eq("property_id", propertyId)
    .single()

  if (unitErr || !unit) return { error: "Unit not found" }

  const unitContext: UnitContext = {
    unit_type: unit.unit_type,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    features: unit.features as string[] | null,
  }

  const rooms = getRoomSuggestions("residential", unitContext)

  // Upsert profile header
  const { data: profile, error: profileErr } = await db
    .from("unit_inspection_profiles")
    .upsert(
      { org_id: orgId, unit_id: unitId, updated_at: new Date().toISOString() },
      { onConflict: "unit_id" },
    )
    .select("id")
    .single()

  if (profileErr || !profile) {
    console.error("[setupProfileFromTemplate] profile upsert error", profileErr?.message)
    return { error: "Could not create inspection profile" }
  }

  // Replace rooms
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
        room_type: r.type,
        label: r.label,
        sort_order: i,
        is_custom: false,
      }))
    )

  if (insertErr) {
    console.error("[setupProfileFromTemplate] rooms insert error", insertErr.message)
    return { error: "Could not save inspection rooms" }
  }

  revalidatePath(`/properties/${propertyId}/units/${unitId}`)
  return {}
}
