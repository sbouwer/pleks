"use server"

/**
 * app/(admin)/admin/site-content/actions.ts — Server action to update a site_content row
 *
 * Auth:   gateway() — org-scoped user session (admin panel itself gates via requireAdminAuth)
 * Data:   site_content table; revalidates public marketing pages on save
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
  return {}
}
