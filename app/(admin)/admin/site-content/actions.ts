"use server"

/**
 * app/(admin)/admin/site-content/actions.ts — Server action to update a site_content row
 *
 * Auth:   requireAdminAuth() — pleks_admin_token HMAC gate, asserted IN the action (server
 *         actions are directly POSTable, so the (admin) route-group gate is NOT sufficient).
 * Data:   site_content table (platform-level, no org_id); revalidates public marketing pages on save.
 */

import { requireAdminAuth } from "@/lib/admin/auth"
import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"

export async function saveContentRow(
  key: string,
  value: string
): Promise<{ error?: string }> {
  await requireAdminAuth()

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
  return {}
}
