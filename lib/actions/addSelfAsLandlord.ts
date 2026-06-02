"use server"

/**
 * lib/actions/addSelfAsLandlord.ts — "Add me as landlord" (the 01C self-landlord)
 *
 * Auth:   requireAgentWriteAccess (org must be active)
 * Data:   user_profiles (profile + self_landlord_id binding), contacts, landlords
 * Notes:  Surfaces ADDENDUM_01C's self-landlord as an explicit action for the onboarding Owner step —
 *         creates/reuses the agent-as-landlord mirror seeded from the profile (bound on Owner tier,
 *         standalone on Steward+, forked on upgrade). Reuses resolveSelfLandlord so there is ONE mirror
 *         identity, never a parallel one. Idempotent — pressing it twice reuses the bound landlord.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"
import { resolveSelfLandlord } from "@/lib/landlords/resolveSelfLandlord"

export interface AddSelfAsLandlordResult { ok: boolean; error?: string; landlordId?: string; name?: string }

export async function addSelfAsLandlord(): Promise<AddSelfAsLandlordResult> {
  try {
    const { db, orgId, userId } = await requireAgentWriteAccess("add_self_as_landlord")
    const result = await resolveSelfLandlord(db, orgId, userId)
    if (!result.ok || !result.landlordId) {
      return { ok: false, error: result.error ?? "Couldn't add you as landlord" }
    }
    const { data: profile } = await db.from("user_profiles").select("full_name").eq("id", userId).maybeSingle()
    revalidatePath("/landlords")
    revalidatePath("/dashboard")
    return { ok: true, landlordId: result.landlordId, name: ((profile?.full_name as string | null) ?? "You").trim() || "You" }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't add you as landlord" }
  }
}
