"use server"

/**
 * lib/actions/selfLandlord.ts — "Add me as landlord" (the 01C self-landlord), review-first
 *
 * Auth:   requireAgentWriteAccess (org must be active)
 * Data:   user_profiles (profile name/phone), auth user (email), user_profiles.self_landlord_id
 * Notes:  Two-step so the agent can REVIEW/complete what's pre-filled before it's saved (onboarding
 *         only captures a name — title, initials and ID are added in the form):
 *           1. getSelfLandlordPrefill() — read the profile into landlord-form values (no writes).
 *           2. the wizard saves the (edited) form via the normal addLandlordParty, then calls
 *              bindSelfLandlord(landlordId) to make it the agent mirror (Owner tier; D-01C-10).
 *         Binding reuses bindSelfLandlordIfOwner so there is ONE mirror identity, never a parallel one.
 */
import { requireAgentWriteAccess, getServerUser } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"
import { bindSelfLandlordIfOwner } from "@/lib/landlords/resolveSelfLandlord"

export interface SelfLandlordPrefill {
  ok:         boolean
  error?:     string
  firstName?: string
  lastName?:  string
  phone?:     string
  email?:     string
}

/** Read the agent's profile into landlord-form values. No writes — the form is the editable surface. */
export async function getSelfLandlordPrefill(): Promise<SelfLandlordPrefill> {
  try {
    const { db, userId } = await requireAgentWriteAccess("add_self_as_landlord")
    const [profileRes, user] = await Promise.all([
      db.from("user_profiles").select("full_name, mobile, phone").eq("id", userId).maybeSingle(),
      getServerUser(),
    ])
    const fullName  = ((profileRes.data?.full_name as string | null) ?? "").trim()
    const firstName = fullName ? fullName.split(/\s+/)[0] : ""
    const lastName  = fullName.includes(" ") ? fullName.slice(fullName.indexOf(" ") + 1).trim() : ""
    const phone     = ((profileRes.data?.mobile as string | null) ?? (profileRes.data?.phone as string | null) ?? "")
    return { ok: true, firstName, lastName, phone, email: user?.email ?? "" }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't read your profile" }
  }
}

/** Bind a just-created landlord as the agent's self-landlord (Owner tier only). */
export async function bindSelfLandlord(landlordId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { db, orgId, userId } = await requireAgentWriteAccess("add_self_as_landlord")
    await bindSelfLandlordIfOwner(db, orgId, userId, landlordId)
    revalidatePath("/landlords")
    revalidatePath("/dashboard")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't link you as landlord" }
  }
}
