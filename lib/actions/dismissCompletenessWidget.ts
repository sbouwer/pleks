"use server"

/**
 * lib/actions/dismissCompletenessWidget.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"

export interface DismissResult {
  ok:    boolean
  error?: string
}

export async function dismissCompletenessWidget(propertyId: string): Promise<DismissResult> {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId } = gw

  const { error } = await db
    .from("properties")
    .update({ onboarding_widget_dismissed_at: new Date().toISOString() })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (error) {
    console.error("dismissCompletenessWidget failed:", error.message)
    return { ok: false, error: error.message }
  }

  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}
