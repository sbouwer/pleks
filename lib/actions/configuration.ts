"use server"

import { gateway } from "@/lib/supabase/gateway"

export async function saveOrgConfiguration(formData: FormData): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const settings = {
    preferences_version: 1,
    communication: {
      tone_tenant: (formData.get("tone_tenant") as string) || "professional",
      tone_owner: (formData.get("tone_owner") as string) || "professional",
      managed_by_label: (formData.get("managed_by_label") as string) || "organisation",
      sms_fallback_enabled: formData.get("sms_fallback_enabled") === "true",
      sms_fallback_delay_hours: Number(formData.get("sms_fallback_delay_hours") || 4),
    },
  }

  const { error } = await db.from("organisations").update({ settings }).eq("id", orgId)
  if (error) {
    console.error("saveOrgConfiguration:", error.message)
    return { error: "Could not save configuration" }
  }
  return {}
}
