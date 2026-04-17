"use server"

import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"

export interface DismissResult {
  ok:    boolean
  error?: string
}

export async function dismissCompletenessWidget(propertyId: string): Promise<DismissResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
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
