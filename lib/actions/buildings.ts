"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

function extractBuildingFields(formData: FormData) {
  const buildingType = formData.get("building_type") as string || "residential"
  const isHeritage = buildingType.startsWith("heritage")
  return {
    name: formData.get("name") as string,
    building_code: (formData.get("building_code") as string) || null,
    building_type: buildingType,
    construction_year: formData.get("construction_year")
      ? Number.parseInt(formData.get("construction_year") as string)
      : null,
    floors_above_ground: formData.get("floors_above_ground")
      ? Number.parseInt(formData.get("floors_above_ground") as string)
      : null,
    total_floor_area_m2: formData.get("total_floor_area_m2")
      ? Number.parseFloat(formData.get("total_floor_area_m2") as string)
      : null,
    heritage_status: isHeritage ? ((formData.get("heritage_status") as string) || "none") : "none",
    heritage_reference: isHeritage ? ((formData.get("heritage_reference") as string) || null) : null,
    maintenance_rhythm: (formData.get("maintenance_rhythm") as string) || "standard",
    heritage_pre_approval_required: isHeritage
      ? formData.get("heritage_pre_approval_required") === "true"
      : false,
    heritage_materials_spec: isHeritage
      ? ((formData.get("heritage_materials_spec") as string) || null)
      : null,
    heritage_approved_contractors_only: isHeritage
      ? formData.get("heritage_approved_contractors_only") === "true"
      : false,
    replacement_value_cents: formData.get("replacement_value")
      ? Math.round(Number.parseFloat(formData.get("replacement_value") as string) * 100)
      : null,
    last_valuation_date: (formData.get("last_valuation_date") as string) || null,
    description: (formData.get("description") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }
}

export async function createBuilding(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const propertyId = formData.get("property_id") as string
  const fields = extractBuildingFields(formData)

  const { error } = await db.from("buildings").insert({
    org_id: orgId,
    property_id: propertyId,
    ...fields,
    is_primary: false,
    is_visible_in_ui: true,
    created_by: userId,
  })

  if (error) return { error: error.message }

  // Mark all buildings on this property as visible (now multi-building)
  await db.from("buildings").update({ is_visible_in_ui: true }).eq("property_id", propertyId)

  revalidatePath(`/properties/${propertyId}`)
  redirect(`/properties/${propertyId}`)
}

export async function updateBuilding(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const buildingId = formData.get("building_id") as string
  const propertyId = formData.get("property_id") as string
  const fields = extractBuildingFields(formData)

  const { error } = await db.from("buildings")
    .update(fields)
    .eq("id", buildingId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  redirect(`/properties/${propertyId}`)
}

/**
 * Enable multi-building mode for a property by making the primary building
 * visible in the UI and giving it a user-chosen name.
 */
export async function enableMultiBuilding(
  propertyId: string,
  primaryBuildingName: string,
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Unauthorised" }
  const { db, orgId } = gw

  const { data: primary, error: fetchErr } = await db
    .from("buildings")
    .select("id")
    .eq("property_id", propertyId)
    .eq("org_id", orgId)
    .eq("is_primary", true)
    .is("deleted_at", null)
    .single()

  if (fetchErr || !primary) return { error: "Primary building not found" }

  const safeName = primaryBuildingName.trim() || "Main building"

  const { error } = await db
    .from("buildings")
    .update({ is_visible_in_ui: true, name: safeName })
    .eq("id", primary.id)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  return {}
}

export async function fetchBuildingsForProperty(propertyId: string) {
  const gw = await gateway()
  if (!gw) return []
  const { db } = gw

  const { data } = await db
    .from("buildings")
    .select("id, name, building_type, maintenance_rhythm, is_primary, is_visible_in_ui")
    .eq("property_id", propertyId)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })

  return data ?? []
}
