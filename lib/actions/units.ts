"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { syncUnitClauseProfile } from "@/lib/leases/syncUnitClauseProfile"

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
      floor: formData.get("floor") ? Number.parseInt(formData.get("floor") as string) : null,
      size_m2: formData.get("size_m2") ? Number.parseFloat(formData.get("size_m2") as string) : null,
      bedrooms: formData.get("bedrooms") ? Number.parseInt(formData.get("bedrooms") as string) : null,
      bathrooms: formData.get("bathrooms") ? Number.parseFloat(formData.get("bathrooms") as string) : null,
      parking_bays: formData.get("parking_bays") ? Number.parseInt(formData.get("parking_bays") as string) : 0,
      furnished: formData.get("furnished") === "true",
      features,
      asking_rent_cents: formData.get("asking_rent") ? Math.round(Number.parseFloat(formData.get("asking_rent") as string) * 100) : null,
      deposit_amount_cents: formData.get("deposit_amount") ? Math.round(Number.parseFloat(formData.get("deposit_amount") as string) * 100) : null,
      managed_by: (formData.get("managed_by") as string) || null,
      notes: formData.get("notes") as string || null,
      status: "vacant",
    })
    .select("id")
    .single()

  if (error || !unit) {
    return { error: error?.message || "Failed to create unit" }
  }

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

  try {
    await syncUnitClauseProfile(supabase, unit.id, orgId, features)
  } catch (err) {
    console.error("[createUnit] syncUnitClauseProfile failed:", err)
  }

  revalidatePath(`/properties/${propertyId}`)
  redirect(`/properties/${propertyId}`)
}

export async function updateUnit(unitId: string, propertyId: string, formData: FormData) {
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

  const updates: Record<string, unknown> = {
    unit_number: formData.get("unit_number"),
    floor: formData.get("floor") ? Number.parseInt(formData.get("floor") as string) : null,
    size_m2: formData.get("size_m2") ? Number.parseFloat(formData.get("size_m2") as string) : null,
    bedrooms: formData.get("bedrooms") ? Number.parseInt(formData.get("bedrooms") as string) : null,
    bathrooms: formData.get("bathrooms") ? Number.parseFloat(formData.get("bathrooms") as string) : null,
    parking_bays: formData.get("parking_bays") ? Number.parseInt(formData.get("parking_bays") as string) : 0,
    furnished: formData.get("furnished") === "true",
    features,
    asking_rent_cents: formData.get("asking_rent") ? Math.round(Number.parseFloat(formData.get("asking_rent") as string) * 100) : null,
    deposit_amount_cents: formData.get("deposit_amount") ? Math.round(Number.parseFloat(formData.get("deposit_amount") as string) * 100) : null,
    managed_by: (formData.get("managed_by") as string) || null,
    notes: formData.get("notes") as string || null,
  }

  const { error } = await supabase.from("units").update(updates).eq("id", unitId)
  if (error) return { error: error.message }

  try {
    await syncUnitClauseProfile(supabase, unitId, orgId, features)
  } catch (err) {
    console.error("[updateUnit] syncUnitClauseProfile failed:", err)
  }

  revalidatePath(`/properties/${propertyId}`)
  redirect(`/properties/${propertyId}`)
}

export async function updateAskingRent(unitId: string, rentCents: number): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("units")
    .update({ asking_rent_cents: rentCents })
    .eq("id", unitId)

  if (error) return { error: error.message }

  revalidatePath("/properties")
  return {}
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

// createUnitData — like createUnit but returns { unitId } or { error } instead of redirecting
export async function createUnitData(propertyId: string, formData: FormData): Promise<{ unitId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorised" }

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return { error: "No org membership" }
  const orgId = membership.org_id

  const features = formData.getAll("features") as string[]

  const { data: unit, error } = await supabase
    .from("units")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      unit_number: formData.get("unit_number") as string,
      floor: formData.get("floor") ? Number.parseInt(formData.get("floor") as string) : null,
      size_m2: formData.get("size_m2") ? Number.parseFloat(formData.get("size_m2") as string) : null,
      bedrooms: formData.get("bedrooms") ? Number.parseInt(formData.get("bedrooms") as string) : null,
      bathrooms: formData.get("bathrooms") ? Number.parseFloat(formData.get("bathrooms") as string) : null,
      parking_bays: formData.get("parking_bays") ? Number.parseInt(formData.get("parking_bays") as string) : 0,
      furnished: formData.get("furnished") === "true",
      features,
      asking_rent_cents: formData.get("asking_rent") ? Math.round(Number.parseFloat(formData.get("asking_rent") as string) * 100) : null,
      deposit_amount_cents: formData.get("deposit_amount") ? Math.round(Number.parseFloat(formData.get("deposit_amount") as string) * 100) : null,
      managed_by: (formData.get("managed_by") as string) || null,
      notes: formData.get("notes") as string || null,
      status: "vacant",
    })
    .select("id")
    .single()

  if (error || !unit) {
    return { error: error?.message || "Failed to create unit" }
  }

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

  try {
    await syncUnitClauseProfile(supabase, unit.id, orgId, features)
  } catch (err) {
    console.error("[createUnitData] syncUnitClauseProfile failed:", err)
  }

  revalidatePath(`/properties/${propertyId}`)
  return { unitId: unit.id }
}

// updateUnitFeatures — PATCH just the features array on a unit
export async function updateUnitFeatures(unitId: string, propertyId: string, features: string[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorised" }
  const { data: unit } = await supabase.from("units").select("org_id").eq("id", unitId).single()
  if (!unit) return { error: "Unit not found" }
  const { error } = await supabase.from("units").update({ features }).eq("id", unitId)
  if (error) return { error: error.message }
  try { await syncUnitClauseProfile(supabase, unitId, unit.org_id, features) } catch {}
  revalidatePath(`/properties/${propertyId}`)
  return {}
}
