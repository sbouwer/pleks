"use server"

/**
 * lib/actions/identityFork.ts — dismiss the identity-fork banner (ADDENDUM_01C §6)
 *
 * Auth:   Signed-in user; writes only their OWN user_profiles dismissal flag (keyed on auth.uid)
 * Data:   user_profiles.fork_banner_dismissed_agent / fork_banner_dismissed_landlord
 * Notes:  Per-surface, DB-backed dismissal (persists per user across devices — not localStorage).
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"

export async function dismissForkBanner(
  surface: "agent" | "landlord",
): Promise<{ ok: boolean }> {
  const user = await getServerUser()
  if (!user) return { ok: false }

  const column =
    surface === "agent" ? "fork_banner_dismissed_agent" : "fork_banner_dismissed_landlord"

  const service = await createServiceClient()
  const { error } = await service
    .from("user_profiles")
    .update({ [column]: true })
    .eq("id", user.id)
  if (error) {
    console.error("[dismissForkBanner] update failed:", error.message)
    return { ok: false }
  }
  // Both surfaces that render the banner, so a revisit inside the router cache does not bring it back.
  revalidatePath("/settings/profile")
  revalidatePath("/(dashboard)/landlords/[id]/(overview)", "page") // typed patterns name their route groups
  return { ok: true }
}
