"use server"

/**
 * lib/actions/configuration.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"

export async function saveOrgConfiguration(formData: FormData): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("edit_org_settings")
  const { db, orgId } = gw

  // Fetch existing settings to merge — never clobber keys owned by other subsystems
  const { data: org, error: fetchError } = await db
    .from("organisations")
    .select("settings")
    .eq("id", orgId)
    .single()

  if (fetchError) {
    console.error("saveOrgConfiguration fetch:", fetchError.message)
    return { error: "Could not load current configuration" }
  }

  const existing = (org?.settings ?? {}) as Record<string, unknown>

  const settings = {
    ...existing,
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
