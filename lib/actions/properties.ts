"use server"

/**
 * lib/actions/properties.ts — CRUD server actions for properties
 *
 * Auth:   requireAgentWriteAccess (all paths are writes)
 * Data:   properties, buildings, managing_schemes tables via gateway service client
 * Notes:  createProperty auto-inserts a default building so single-building properties
 *         are transparent; archiveProperty soft-deletes (deleted_at) + cascades the same timestamp
 *         to its buildings/units (guarded by in-force leases), reactivateProperty reverses that exact
 *         cascade; deleteProperty is a hard delete guarded by a zero-unit check.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"
import { propertyHasInForceLease } from "@/lib/parties/archive"
import { mandatoryGate, MissingMandatoryFieldsError } from "@/lib/migration/mandatoryGate"

export async function createProperty(formData: FormData) {
  const gw = await requireAgentWriteAccess("create_property")
  const { db, userId, orgId } = gw

  // 21E §1: live-create refuses a missing mandatory field SERVER-SIDE (the classic form had no guard — a blank
  // city/province landed silently once the DB NOT NULL floor was relaxed for import). Import lands flagged; here
  // the agent is filling a form, so refuse and name what to add.
  const name = (formData.get("name") as string | null)?.trim() || null
  const address_line1 = (formData.get("address_line1") as string | null)?.trim() || null
  const city = (formData.get("city") as string | null)?.trim() || null
  const province = (formData.get("province") as string | null)?.trim() || null
  let propGate: { incomplete_mandatory: null }
  try {
    propGate = mandatoryGate("property", { name, address_line1, city, province }, { relax: false }) as { incomplete_mandatory: null }
  } catch (e) {
    if (e instanceof MissingMandatoryFieldsError) return { error: `Please add the property's ${e.missing.join(", ")}.` }
    throw e
  }

  const { data: property, error } = await db
    .from("properties")
    .insert({
      org_id: orgId,
      name,
      type: formData.get("type") as string || "residential",
      address_line1,
      address_line2: formData.get("address_line2") as string || null,
      suburb: formData.get("suburb") as string || null,
      city,
      province,
      ...propGate,
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
        .eq("org_id", orgId)
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

  await recordAudit(db, { orgId: orgId, table: "properties", recordId: property.id, action: "INSERT", actorId: userId, after: { name: formData.get("name") } })

  revalidatePath("/properties")
  redirect(`/properties/${property.id}`)
}

export async function updateProperty(propertyId: string, formData: FormData) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, userId, orgId } = gw

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
    .eq("org_id", orgId) // org-scope guard (caller-ID census)

  if (error) return { error: error.message }

  // Get org_id for audit
  const { data: prop, error: propError } = await db
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .single()
    logQueryError("updateProperty properties", propError)

  if (prop) {
    await recordAudit(db, { orgId: prop.org_id, table: "properties", recordId: propertyId, action: "UPDATE", actorId: userId, after: updates })
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath("/properties")
  return { success: true }
}

/**
 * Archive a property (D-3): blocked if ANY lease on it is in force; otherwise soft-delete the property
 * AND cascade the SAME deleted_at timestamp to its currently-active buildings + units, so a later
 * Restore reverses exactly this cascade (independently-archived units keep their own timestamp).
 */
export async function archiveProperty(propertyId: string): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId, userId, isAdmin } = gw
  if (!isAdmin) return { error: "Admin access required" }

  if (await propertyHasInForceLease(db, orgId, propertyId)) {
    return { error: "This property has an in-force lease (active, on notice, or month-to-month) on one of its units. End the lease before archiving — archiving only retires it from active lists." }
  }

  const ts = new Date().toISOString()

  const { error: propErr } = await db
    .from("properties").update({ deleted_at: ts }).eq("id", propertyId).eq("org_id", orgId)
  if (propErr) return { error: propErr.message }

  const { error: bErr } = await db
    .from("buildings").update({ deleted_at: ts }).eq("property_id", propertyId).eq("org_id", orgId).is("deleted_at", null)
  logQueryError("archiveProperty buildings cascade", bErr)
  const { data: archivedUnits, error: uErr } = await db
    .from("units").update({ deleted_at: ts }).eq("property_id", propertyId).eq("org_id", orgId).is("deleted_at", null).select("id")
  logQueryError("archiveProperty units cascade", uErr)

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "properties", recordId: propertyId,
    after: { action: "archive_property", cascade_ts: ts, units_archived: (archivedUnits ?? []).length },
  })

  revalidatePath("/properties")
  return {}
}

/**
 * Restore a property (D-4): clear deleted_at on the property + the buildings/units whose deleted_at
 * EQUALS the property's (i.e. archived by that cascade) — units archived independently earlier (a
 * different timestamp) stay archived.
 */
export async function reactivateProperty(propertyId: string): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId, userId, isAdmin } = gw
  if (!isAdmin) return { error: "Admin access required" }

  const { data: prop, error: readErr } = await db
    .from("properties").select("deleted_at").eq("id", propertyId).eq("org_id", orgId).maybeSingle()
  logQueryError("reactivateProperty read", readErr)
  const ts = prop?.deleted_at as string | null

  const { error: propErr } = await db
    .from("properties").update({ deleted_at: null }).eq("id", propertyId).eq("org_id", orgId)
  if (propErr) return { error: propErr.message }

  if (ts) {
    const { error: bErr } = await db
      .from("buildings").update({ deleted_at: null }).eq("property_id", propertyId).eq("org_id", orgId).eq("deleted_at", ts)
    logQueryError("reactivateProperty buildings cascade", bErr)
    const { error: uErr } = await db
      .from("units").update({ deleted_at: null }).eq("property_id", propertyId).eq("org_id", orgId).eq("deleted_at", ts)
    logQueryError("reactivateProperty units cascade", uErr)
  }

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "properties", recordId: propertyId,
    after: { action: "restore_property", cascade_ts: ts },
  })

  revalidatePath("/properties")
  return {}
}

export async function deleteProperty(propertyId: string) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId, isAdmin } = gw
  if (!isAdmin) return { error: "Admin access required" }

  // Org-scope guard (caller-ID census): service client bypasses RLS, so a foreign propertyId must
  // match no row — never trust the caller-supplied id without the org filter.
  const { error } = await db
    .from("properties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/properties")
  redirect("/properties")
}
