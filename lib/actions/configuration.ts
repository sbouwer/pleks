"use server"

/**
 * lib/actions/configuration.ts — org-level configuration writes (Settings)
 *
 * Auth:   requireAgentWriteAccess (agent write gate — subscription lockdown enforced)
 * Data:   organisations.settings (JSON, merged) + scalar org columns; keyed by organisations.id = orgId
 * Notes:  saveOrgConfiguration merges into the settings JSON so it never clobbers other subsystems' keys.
 *         setDefaultLeaseDocumentSource (ADDENDUM_LEASE_CREATION_MODAL Phase 3 / D-7) persists the lease
 *         document-source fork default; null clears it (back to undecided → the lease step shows the fork).
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"

export type LeaseDocumentSource = "pleks" | "external"

/**
 * Persist the org's default lease document source (Axis A). 'pleks' = Generate with Pleks,
 * 'external' = Upload signed leases, null = undecided. Read by the lease CreateStep via useOrg().
 */
export async function setDefaultLeaseDocumentSource(
  source: LeaseDocumentSource | null,
): Promise<{ error?: string }> {
  const { db, orgId } = await requireAgentWriteAccess("edit_org_settings")

  const { error } = await db
    .from("organisations")
    .update({ default_lease_document_source: source })
    .eq("id", orgId)

  if (error) {
    console.error("setDefaultLeaseDocumentSource:", error.message)
    return { error: "Could not save your lease default" }
  }
  return {}
}

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
