"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createProperty(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const { data: property, error } = await db
    .from("properties")
    .insert({
      org_id: orgId,
      name: formData.get("name") as string,
      type: formData.get("type") as string || "residential",
      address_line1: formData.get("address_line1") as string,
      address_line2: formData.get("address_line2") as string || null,
      suburb: formData.get("suburb") as string || null,
      city: formData.get("city") as string,
      province: formData.get("province") as string,
      postal_code: formData.get("postal_code") as string || null,
      erf_number: formData.get("erf_number") as string || null,
      sectional_title_number: formData.get("sectional_title_number") as string || null,
      google_place_id: formData.get("google_place_id") as string || null,
      gps_lat: formData.get("gps_lat") ? Number.parseFloat(formData.get("gps_lat") as string) : null,
      gps_lng: formData.get("gps_lng") ? Number.parseFloat(formData.get("gps_lng") as string) : null,
      notes: formData.get("notes") as string || null,
      managing_agent_id: formData.get("managing_agent_id") as string || null,
    })
    .select("id")
    .single()

  if (error || !property) {
    return { error: error?.message || "Failed to create property" }
  }

  // Create managing scheme if selected
  const schemeType = formData.get("scheme_type") as string | null
  if (schemeType && schemeType !== "none") {
    const schemeName = (formData.get("scheme_name") as string) || (formData.get("name") as string)
    const { data: scheme, error: schemeErr } = await db
      .from("managing_schemes")
      .insert({
        org_id: orgId,
        name: schemeName,
        scheme_type: schemeType,
      })
      .select("id")
      .single()

    if (!schemeErr && scheme) {
      await db
        .from("properties")
        .update({ managing_scheme_id: scheme.id })
        .eq("id", property.id)
    }
  }

  // Auto-create default building (transparent for single-building properties)
  const propertyType = formData.get("type") as string || "residential"
  let buildingType: string
  if (propertyType === "residential") { buildingType = "residential" }
  else if (propertyType === "commercial") { buildingType = "commercial" }
  else { buildingType = "mixed_use" }

  await db.from("buildings").insert({
    org_id: orgId,
    property_id: property.id,
    name: formData.get("name") as string,
    building_type: buildingType,
    is_primary: true,
    is_visible_in_ui: false,
    created_by: userId,
  })

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "properties",
    record_id: property.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { name: formData.get("name") },
  })

  revalidatePath("/properties")
  redirect(`/properties/${property.id}`)
}

export async function updateProperty(propertyId: string, formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId } = gw

  const isSectional = formData.get("is_sectional_title") === "true"
  const levyDisplay = formData.get("levy_amount_cents_display") as string | null
  const levyCents = levyDisplay && levyDisplay.trim() !== "" ? Math.round(Number.parseFloat(levyDisplay) * 100) : null
  const managingSchemeRaw = formData.get("managing_scheme_id") as string | null

  const updates: Record<string, unknown> = {
    name: formData.get("name"),
    type: formData.get("type"),
    address_line1: formData.get("address_line1"),
    address_line2: formData.get("address_line2") || null,
    suburb: formData.get("suburb") || null,
    city: formData.get("city"),
    province: formData.get("province"),
    postal_code: formData.get("postal_code") || null,
    erf_number: formData.get("erf_number") || null,
    sectional_title_number: formData.get("sectional_title_number") || null,
    notes: formData.get("notes") || null,
    is_sectional_title: isSectional,
    managing_scheme_id: isSectional && managingSchemeRaw ? managingSchemeRaw : null,
    levy_amount_cents: isSectional ? levyCents : null,
    levy_account_number: isSectional ? (formData.get("levy_account_number") as string | null) || null : null,
  }

  const { error } = await db
    .from("properties")
    .update(updates)
    .eq("id", propertyId)

  if (error) return { error: error.message }

  // Get org_id for audit
  const { data: prop } = await db
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .single()

  if (prop) {
    await db.from("audit_log").insert({
      org_id: prop.org_id,
      table_name: "properties",
      record_id: propertyId,
      action: "UPDATE",
      changed_by: userId,
      new_values: updates,
    })
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath("/properties")
  return { success: true }
}

export async function archiveProperty(propertyId: string): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, isAdmin } = gw
  if (!isAdmin) return { error: "Admin access required" }

  // Check for active leases first
  const { count } = await db
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .in("status", ["active", "notice", "month_to_month"])
    .is("deleted_at", null)

  if (count && count > 0) {
    return { error: "Active leases must be terminated before archiving." }
  }

  const { error } = await db
    .from("properties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", propertyId)

  if (error) return { error: error.message }

  revalidatePath("/properties")
  return {}
}

export async function deleteProperty(propertyId: string) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, isAdmin } = gw
  if (!isAdmin) return { error: "Admin access required" }

  const { error } = await db
    .from("properties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", propertyId)

  if (error) return { error: error.message }

  revalidatePath("/properties")
  redirect("/properties")
}
