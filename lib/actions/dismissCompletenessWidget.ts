"use server"

/**
 * lib/actions/dismissCompletenessWidget.ts — dismisses a property's onboarding completeness widget
 *
 * Auth:   requireAgentWriteAccess("edit_property")
 * Data:   updates properties.onboarding_widget_dismissed_at (org-scoped); revalidates the property page
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
