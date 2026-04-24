"use server"

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
