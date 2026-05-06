"use server"

/**
 * app/(admin)/admin/external-links/actions.ts — Server action to update a URL in external_links
 *
 * Auth:   requireAdminAuth() — pleks_admin_token HMAC verification
 * Data:   external_links table via service client (no org_id — platform-level table)
 */

import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function saveExternalLink(
  key: string,
  url: string
): Promise<{ error?: string }> {
  await requireAdminAuth()

  const service = await createServiceClient()
  const { error } = await service
    .from("external_links")
    .update({ url })
    .eq("key", key)

  if (error) {
    console.error("saveExternalLink failed:", error.message)
    return { error: error.message }
  }

  revalidatePath("/admin/external-links")
  return {}
}
