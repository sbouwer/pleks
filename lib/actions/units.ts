"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createUnit(propertyId: string, formData: FormData) {
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

  const features = formData.getAll("features") as string[]

  const { data: unit, error } = await supabase
    .from("units")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      unit_number: formData.get("unit_number") as string,
      floor: formData.get("floor") ? parseInt(formData.get("floor") as string) : null,
      size_m2: formData.get("size_m2") ? parseFloat(formData.get("size_m2") as string) : null,
      bedrooms: formData.get("bedrooms") ? parseInt(formData.get("bedrooms") as string) : null,
      bathrooms: formData.get("bathrooms") ? parseFloat(formData.get("bathrooms") as string) : null,
      parking_bays: formData.get("parking_bays") ? parseInt(formData.get("parking_bays") as string) : 0,
      furnished: formData.get("furnished") === "true",
      features,
      asking_rent_cents: formData.get("asking_rent") ? Math.round(parseFloat(formData.get("asking_rent") as string) * 100) : null,
      notes: formData.get("notes") as string || null,
      status: "vacant",
    })
    .select("id")
    .single()

  if (error || !unit) {
    return { error: error?.message || "Failed to create unit" }
  }

  // Log initial status
  await supabase.from("unit_status_history").insert({
    unit_id: unit.id,
    org_id: orgId,
    to_status: "vacant",
    changed_by: user.id,
    reason: "Unit created",
  })

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "units",
    record_id: unit.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: { unit_number: formData.get("unit_number"), property_id: propertyId },
  })

  revalidatePath(`/properties/${propertyId}`)
  redirect(`/properties/${propertyId}`)
}

export async function updateUnit(unitId: string, propertyId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const features = formData.getAll("features") as string[]

  const updates: Record<string, unknown> = {
    unit_number: formData.get("unit_number"),
    floor: formData.get("floor") ? parseInt(formData.get("floor") as string) : null,
    size_m2: formData.get("size_m2") ? parseFloat(formData.get("size_m2") as string) : null,
    bedrooms: formData.get("bedrooms") ? parseInt(formData.get("bedrooms") as string) : null,
    bathrooms: formData.get("bathrooms") ? parseFloat(formData.get("bathrooms") as string) : null,
    parking_bays: formData.get("parking_bays") ? parseInt(formData.get("parking_bays") as string) : 0,
    furnished: formData.get("furnished") === "true",
    features,
    asking_rent_cents: formData.get("asking_rent") ? Math.round(parseFloat(formData.get("asking_rent") as string) * 100) : null,
    notes: formData.get("notes") as string || null,
  }

  const { error } = await supabase.from("units").update(updates).eq("id", unitId)
  if (error) return { error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  redirect(`/properties/${propertyId}`)
}

export async function updateUnitStatus(
  unitId: string,
  propertyId: string,
  newStatus: string,
  reason?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Get current status
  const { data: unit } = await supabase
    .from("units")
    .select("status, org_id")
    .eq("id", unitId)
    .single()

  if (!unit) return { error: "Unit not found" }

  const { error } = await supabase
    .from("units")
    .update({
      status: newStatus,
      is_archived: newStatus === "archived",
    })
    .eq("id", unitId)

  if (error) return { error: error.message }

  await supabase.from("unit_status_history").insert({
    unit_id: unitId,
    org_id: unit.org_id,
    from_status: unit.status,
    to_status: newStatus,
    changed_by: user.id,
    reason: reason || null,
  })

  await supabase.from("audit_log").insert({
    org_id: unit.org_id,
    table_name: "units",
    record_id: unitId,
    action: "UPDATE",
    changed_by: user.id,
    old_values: { status: unit.status },
    new_values: { status: newStatus },
  })

  revalidatePath(`/properties/${propertyId}`)
}
