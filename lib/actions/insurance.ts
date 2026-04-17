"use server"

import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"

export async function saveInsurancePolicy(propertyId: string, formData: FormData) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId } = gw

  const replacementRaw = formData.get("insurance_replacement_value") as string | null
  const excessRaw = formData.get("insurance_excess") as string | null

  const updates = {
    insurance_policy_number:        (formData.get("insurance_policy_number") as string) || null,
    insurance_provider:             (formData.get("insurance_provider") as string) || null,
    insurance_policy_type:          (formData.get("insurance_policy_type") as string) || null,
    insurance_renewal_date:         (formData.get("insurance_renewal_date") as string) || null,
    insurance_replacement_value_cents: replacementRaw?.trim()
      ? Math.round(Number.parseFloat(replacementRaw) * 100)
      : null,
    insurance_excess_cents: excessRaw?.trim()
      ? Math.round(Number.parseFloat(excessRaw) * 100)
      : null,
    insurance_notes: (formData.get("insurance_notes") as string) || null,
  }

  const { error } = await db
    .from("properties")
    .update(updates)
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "properties",
    record_id: propertyId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { ...updates, _section: "insurance_policy" },
  })

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}

export async function saveBroker(propertyId: string, formData: FormData) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const brokerContactId = (formData.get("broker_contact_id") as string) || null

  if (!brokerContactId) {
    const { error } = await db
      .from("property_brokers")
      .delete()
      .eq("property_id", propertyId)
    if (error) return { error: error.message }
  } else {
    const notifyChannelsRaw = formData.getAll("notify_channels") as string[]
    const notifyChannels = notifyChannelsRaw.length > 0 ? notifyChannelsRaw : ["email"]

    const { error } = await db
      .from("property_brokers")
      .upsert({
        property_id:           propertyId,
        org_id:                orgId,
        broker_contact_id:     brokerContactId,
        auto_notify_critical:  formData.get("auto_notify_critical") === "true",
        notify_channels:       notifyChannels,
        after_hours_number:    (formData.get("after_hours_number") as string) || null,
        notes:                 (formData.get("broker_notes") as string) || null,
      })
    if (error) return { error: error.message }
  }

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}
