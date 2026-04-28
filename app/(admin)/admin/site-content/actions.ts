"use server"

/**
 * app/(admin)/admin/site-content/actions.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"

export async function saveContentRow(
  key: string,
  value: string
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const { error } = await gw.db
    .from("site_content")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", key)

  if (error) {
    console.error("saveContentRow failed:", error.message)
    return { error: error.message }
  }

  revalidatePath("/")
  revalidatePath("/pricing")
  revalidatePath("/for-agents")
  return {}
}
