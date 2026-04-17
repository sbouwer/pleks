"use server"

import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"

export async function saveManagingScheme(schemeId: string, propertyId: string, formData: FormData) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId } = gw

  const updates = {
    name:                     (formData.get("name") as string) || "",
    scheme_type:              (formData.get("scheme_type") as string) || "other",
    csos_registration_number: (formData.get("csos_registration_number") as string) || null,
    levy_cycle:               (formData.get("levy_cycle") as string) || null,
    csos_ombud_contact:       (formData.get("csos_ombud_contact") as string) || null,
    notes:                    (formData.get("notes") as string) || null,
  }

  const { error } = await db
    .from("managing_schemes")
    .update(updates)
    .eq("id", schemeId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "managing_schemes",
    record_id: schemeId,
    action: "UPDATE",
    changed_by: userId,
    new_values: updates,
  })

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}

export async function createManagingScheme(propertyId: string, formData: FormData) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId } = gw

  const { data: scheme, error: schemeErr } = await db
    .from("managing_schemes")
    .insert({
      org_id:                   orgId,
      name:                     (formData.get("name") as string) || "",
      scheme_type:              (formData.get("scheme_type") as string) || "other",
      csos_registration_number: (formData.get("csos_registration_number") as string) || null,
      levy_cycle:               (formData.get("levy_cycle") as string) || null,
      csos_ombud_contact:       (formData.get("csos_ombud_contact") as string) || null,
      notes:                    (formData.get("notes") as string) || null,
    })
    .select("id")
    .single()

  if (schemeErr || !scheme) return { error: schemeErr?.message ?? "Failed to create scheme" }

  const { error: linkErr } = await db
    .from("properties")
    .update({ managing_scheme_id: scheme.id })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (linkErr) return { error: linkErr.message }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "managing_schemes",
    record_id: scheme.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { property_id: propertyId },
  })

  revalidatePath(`/properties/${propertyId}`)
  return { success: true, schemeId: scheme.id }
}

export async function unlinkManagingScheme(propertyId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId } = gw

  const { error } = await db
    .from("properties")
    .update({ managing_scheme_id: null })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "properties",
    record_id: propertyId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { managing_scheme_id: null },
  })

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}
