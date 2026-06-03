"use server"

/**
 * lib/actions/units.ts — server actions for units (create, update, status, features, lease rule-set write-back)
 *
 * Auth:   requireAgentWriteAccess (subscription-gated) on every mutation
 * Data:   units, unit_status_history; clause profile via syncUnitClauseProfile
 * Notes:  writeBackUnitRuleSet enriches the unit from lease creation — it only fills currently-empty
 *         unit columns (ADDENDUM_LEASE_CREATION_MODAL §3); populated values are never overwritten.
 */
import { SupabaseClient } from "@supabase/supabase-js"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { syncUnitClauseProfile } from "@/lib/leases/syncUnitClauseProfile"

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUnitFields(formData: FormData) {
  return {
    unit_number: formData.get("unit_number") as string,
    unit_type: (formData.get("unit_type") as string) || null,
    floor: formData.get("floor") ? Number.parseInt(formData.get("floor") as string) : null,
    size_m2: formData.get("size_m2") ? Number.parseFloat(formData.get("size_m2") as string) : null,
    bedrooms: formData.get("bedrooms") ? Number.parseInt(formData.get("bedrooms") as string) : null,
    bathrooms: formData.get("bathrooms") ? Number.parseFloat(formData.get("bathrooms") as string) : null,
    parking_bays: formData.get("parking_bays") ? Number.parseInt(formData.get("parking_bays") as string) : 0,
    furnishing_status: (formData.get("furnishing_status") as string) || "unfurnished",
    features: formData.getAll("features") as string[],
    asking_rent_cents: formData.get("asking_rent") ? Math.round(Number.parseFloat(formData.get("asking_rent") as string) * 100) : null,
    deposit_amount_cents: formData.get("deposit_amount") ? Math.round(Number.parseFloat(formData.get("deposit_amount") as string) * 100) : null,
    building_id: (formData.get("building_id") as string) || null,
    managed_by: (formData.get("managed_by") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }
}

type FurnishingRow = {
  org_id: string
  unit_id: string
  category: string
  item_name: string
  quantity: number
  notes: string | null
  is_custom: boolean
}

async function upsertFurnishings(
  db: SupabaseClient,
  unitId: string,
  orgId: string,
  furnishingsJson: string | null,
): Promise<void> {
  if (!furnishingsJson) return

  let rows: Array<{ category: string; item_name: string; quantity: number; notes: string | null; is_custom: boolean }>
  try {
    rows = JSON.parse(furnishingsJson)
  } catch {
    return
  }

  // Delete existing and re-insert (simpler than diffing)
  await db.from("unit_furnishings").delete().eq("unit_id", unitId)

  if (rows.length === 0) return

  const insertRows: FurnishingRow[] = rows.map((r) => ({
    org_id: orgId,
    unit_id: unitId,
    category: r.category,
    item_name: r.item_name,
    quantity: r.quantity ?? 1,
    notes: r.notes ?? null,
    is_custom: r.is_custom ?? false,
  }))

  const { error } = await db.from("unit_furnishings").insert(insertRows)
  if (error) console.error("[upsertFurnishings] failed:", error.message)
}

type RoomRow = {
  org_id: string
  profile_id: string
  room_type: string
  label: string
  sort_order: number
  is_custom: boolean
}

async function upsertInspectionProfile(
  db: SupabaseClient,
  unitId: string,
  orgId: string,
  roomsJson: string | null,
): Promise<void> {
  if (!roomsJson) return

  let rooms: Array<{ room_type: string; label: string; sort_order: number; is_custom: boolean }>
  try {
    rooms = JSON.parse(roomsJson)
  } catch {
    return
  }

  // Get or create the profile
  const { data: existing } = await db
    .from("unit_inspection_profiles")
    .select("id")
    .eq("unit_id", unitId)
    .maybeSingle()

  let profileId: string

  if (existing) {
    profileId = existing.id
    // Touch updated_at
    await db
      .from("unit_inspection_profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", profileId)
  } else {
    const { data: created, error } = await db
      .from("unit_inspection_profiles")
      .insert({ org_id: orgId, unit_id: unitId })
      .select("id")
      .single()
    if (error || !created) {
      console.error("[upsertInspectionProfile] create failed:", error?.message)
      return
    }
    profileId = created.id
  }

  // Replace rooms
  await db.from("unit_inspection_profile_rooms").delete().eq("profile_id", profileId)

  if (rooms.length === 0) return

  const insertRows: RoomRow[] = rooms.map((r) => ({
    org_id: orgId,
    profile_id: profileId,
    room_type: r.room_type,
    label: r.label,
    sort_order: r.sort_order,
    is_custom: r.is_custom,
  }))

  const { error } = await db.from("unit_inspection_profile_rooms").insert(insertRows)
  if (error) console.error("[upsertInspectionProfile] rooms insert failed:", error.message)
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function createUnit(propertyId: string, formData: FormData) {
  const gw = await requireAgentWriteAccess("create_property")
  const { db, userId, orgId } = gw

  const fields = parseUnitFields(formData)

  const { data: unit, error } = await db
    .from("units")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      ...fields,
      status: "vacant",
    })
    .select("id")
    .single()

  if (error || !unit) {
    return { error: error?.message ?? "Failed to create unit" }
  }

  await upsertFurnishings(db, unit.id, orgId, formData.get("furnishings_json") as string | null)
  await upsertInspectionProfile(db, unit.id, orgId, formData.get("rooms_json") as string | null)

  await db.from("unit_status_history").insert({
    unit_id: unit.id,
    org_id: orgId,
    to_status: "vacant",
    changed_by: userId,
    reason: "Unit created",
  })

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "units",
    record_id: unit.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { unit_number: fields.unit_number, property_id: propertyId },
  })

  try {
    await syncUnitClauseProfile(db, unit.id, orgId, fields.features)
  } catch (err) {
    console.error("[createUnit] syncUnitClauseProfile failed:", err)
  }

  revalidatePath(`/properties/${propertyId}`)
  redirect(`/properties/${propertyId}/units/${unit.id}`)
}

export async function updateUnit(unitId: string, propertyId: string, formData: FormData) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId } = gw

  const fields = parseUnitFields(formData)

  const { error } = await db.from("units").update(fields).eq("id", unitId)
  if (error) return { error: error.message }

  await upsertFurnishings(db, unitId, orgId, formData.get("furnishings_json") as string | null)
  await upsertInspectionProfile(db, unitId, orgId, formData.get("rooms_json") as string | null)

  try {
    await syncUnitClauseProfile(db, unitId, orgId, fields.features)
  } catch (err) {
    console.error("[updateUnit] syncUnitClauseProfile failed:", err)
  }

  revalidatePath(`/properties/${propertyId}/units/${unitId}`)
  revalidatePath(`/properties/${propertyId}`)
  redirect(`/properties/${propertyId}/units/${unitId}`)
}

export async function updateAskingRent(unitId: string, rentCents: number): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db } = gw

  const { error } = await db
    .from("units")
    .update({ asking_rent_cents: rentCents })
    .eq("id", unitId)

  if (error) return { error: error.message }

  revalidatePath("/properties")
  return {}
}

/**
 * Write lease-creation rule-set values back to the unit (ADDENDUM_LEASE_CREATION_MODAL §3).
 *
 * Only fills unit columns that are currently EMPTY (null asking_rent / 0-or-null parking_bays). A column
 * that already carries a value is left untouched — the per-lease figure stays lease-local. Best-effort:
 * never throws; lease creation does not depend on it succeeding.
 */
export async function writeBackUnitRuleSet(
  unitId: string,
  values: { askingRentCents?: number | null; parkingBays?: number | null },
): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId } = gw

  const { data: unit, error: readErr } = await db
    .from("units")
    .select("asking_rent_cents, parking_bays")
    .eq("id", unitId)
    .eq("org_id", orgId)
    .single()
  if (readErr || !unit) return { error: readErr?.message ?? "Unit not found" }

  const patch: Record<string, number> = {}
  // asking_rent_cents: fill only if the unit has none and the lease carries a positive value.
  if ((unit.asking_rent_cents === null || unit.asking_rent_cents === undefined) && values.askingRentCents && values.askingRentCents > 0) {
    patch.asking_rent_cents = values.askingRentCents
  }
  // parking_bays: fill only if the unit has none (null/0) and the lease carries a positive value.
  if (!unit.parking_bays && values.parkingBays && values.parkingBays > 0) {
    patch.parking_bays = values.parkingBays
  }

  if (Object.keys(patch).length === 0) return {}

  const { error } = await db.from("units").update(patch).eq("id", unitId).eq("org_id", orgId)
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
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, userId } = gw

  const { data: unit } = await db
    .from("units")
    .select("status, org_id")
    .eq("id", unitId)
    .single()

  if (!unit) return { error: "Unit not found" }

  const { error } = await db
    .from("units")
    .update({
      status: newStatus,
      is_archived: newStatus === "archived",
    })
    .eq("id", unitId)

  if (error) return { error: error.message }

  await db.from("unit_status_history").insert({
    unit_id: unitId,
    org_id: unit.org_id,
    from_status: unit.status,
    to_status: newStatus,
    changed_by: userId,
    reason: reason || null,
  })

  await db.from("audit_log").insert({
    org_id: unit.org_id,
    table_name: "units",
    record_id: unitId,
    action: "UPDATE",
    changed_by: userId,
    old_values: { status: unit.status },
    new_values: { status: newStatus },
  })

  revalidatePath(`/properties/${propertyId}`)
}

// createUnitData — like createUnit but returns { unitId } or { error } instead of redirecting
export async function createUnitData(propertyId: string, formData: FormData): Promise<{ unitId?: string; error?: string }> {
  const gw = await requireAgentWriteAccess("create_property")
  const { db, userId, orgId } = gw

  const fields = parseUnitFields(formData)

  const { data: unit, error } = await db
    .from("units")
    .insert({ org_id: orgId, property_id: propertyId, ...fields, status: "vacant" })
    .select("id")
    .single()

  if (error || !unit) {
    return { error: error?.message ?? "Failed to create unit" }
  }

  await upsertFurnishings(db, unit.id, orgId, formData.get("furnishings_json") as string | null)
  await upsertInspectionProfile(db, unit.id, orgId, formData.get("rooms_json") as string | null)

  await db.from("unit_status_history").insert({
    unit_id: unit.id,
    org_id: orgId,
    to_status: "vacant",
    changed_by: userId,
    reason: "Unit created",
  })

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "units",
    record_id: unit.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { unit_number: fields.unit_number, property_id: propertyId },
  })

  try {
    await syncUnitClauseProfile(db, unit.id, orgId, fields.features)
  } catch (err) {
    console.error("[createUnitData] syncUnitClauseProfile failed:", err)
  }

  revalidatePath(`/properties/${propertyId}`)
  return { unitId: unit.id }
}

// updateUnitFeatures — PATCH just the features array on a unit
export async function updateUnitFeatures(unitId: string, propertyId: string, features: string[]): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db } = gw

  const { data: unit } = await db.from("units").select("org_id").eq("id", unitId).single()
  if (!unit) return { error: "Unit not found" }
  const { error } = await db.from("units").update({ features }).eq("id", unitId)
  if (error) return { error: error.message }
  try { await syncUnitClauseProfile(db, unitId, unit.org_id, features) } catch {}
  revalidatePath(`/properties/${propertyId}`)
  return {}
}

export async function setProspectiveTenants(
  unitId: string,
  tenantId: string | null,
  coTenantIds: string[],
): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db } = gw

  const { error } = await db
    .from("units")
    .update({
      prospective_tenant_id: tenantId,
      prospective_co_tenant_ids: coTenantIds,
    })
    .eq("id", unitId)

  if (error) return { error: error.message }
  revalidatePath("/properties")
  return {}
}
