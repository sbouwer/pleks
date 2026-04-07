"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createProperty(formData: FormData) {
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

  const { data: property, error } = await supabase
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
      gps_lat: formData.get("gps_lat") ? parseFloat(formData.get("gps_lat") as string) : null,
      gps_lng: formData.get("gps_lng") ? parseFloat(formData.get("gps_lng") as string) : null,
      notes: formData.get("notes") as string || null,
      managing_agent_id: formData.get("managing_agent_id") as string || null,
    })
    .select("id")
    .single()

  if (error || !property) {
    return { error: error?.message || "Failed to create property" }
  }

  // Auto-create default building (transparent for single-building properties)
  const propertyType = formData.get("type") as string || "residential"
  const buildingType = propertyType === "residential" ? "residential"
    : propertyType === "commercial" ? "commercial"
    : "mixed_use"

  await supabase.from("buildings").insert({
    org_id: orgId,
    property_id: property.id,
    name: formData.get("name") as string,
    building_type: buildingType,
    is_primary: true,
    is_visible_in_ui: false,
    created_by: user.id,
  })

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "properties",
    record_id: property.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: { name: formData.get("name") },
  })

  revalidatePath("/properties")
  redirect(`/properties/${property.id}`)
}

export async function updateProperty(propertyId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

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

  const { error } = await supabase
    .from("properties")
    .update(updates)
    .eq("id", propertyId)

  if (error) return { error: error.message }

  // Get org_id for audit
  const { data: prop } = await supabase
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .single()

  if (prop) {
    await supabase.from("audit_log").insert({
      org_id: prop.org_id,
      table_name: "properties",
      record_id: propertyId,
      action: "UPDATE",
      changed_by: user.id,
      new_values: updates,
    })
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath("/properties")
  return { success: true }
}

export async function archiveProperty(propertyId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Check for active leases first
  const { count } = await supabase
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .in("status", ["active", "notice", "month_to_month"])
    .is("deleted_at", null)

  if (count && count > 0) {
    return { error: "Active leases must be terminated before archiving." }
  }

  const { error } = await supabase
    .from("properties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", propertyId)

  if (error) return { error: error.message }

  revalidatePath("/properties")
  return {}
}

export async function deleteProperty(propertyId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { error } = await supabase
    .from("properties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", propertyId)

  if (error) return { error: error.message }

  revalidatePath("/properties")
  redirect("/properties")
}
