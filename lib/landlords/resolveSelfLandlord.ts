/**
 * lib/landlords/resolveSelfLandlord.ts — the 01C self-landlord (agent-as-landlord mirror)
 *
 * Notes:  ADDENDUM_01C D-01C-01. The agent IS the landlord ("for myself" / "add me as landlord"), but a
 *         landlord record is ALWAYS created — seeded from the agent's profile and, on the Owner tier
 *         only, bound to the agent via user_profiles.self_landlord_id so the two stay synced (Model B).
 *         On Steward+ it's standalone (the decoupled state is correct above Owner — D-01C-10; onTierChanged
 *         forks an existing binding on upgrade). Idempotent: an existing binding is reused, so a second
 *         self-owned property (or pressing "add me as landlord" twice) never creates a second self-landlord.
 *         Extracted from createPropertyFromWizard so the onboarding "Add me as landlord" path reuses the
 *         same canonical logic instead of duplicating identity behaviour.
 */
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import type { GatewayContext } from "@/lib/supabase/gateway"

type Db = GatewayContext["db"]

export interface ResolveLandlordResult {
  ok:                 boolean
  landlordId?:        string | null
  /** Set only when this call created the contact row (so rollback can delete it) */
  createdContactId?:  string | null
  /** Set only when this call created the landlord row */
  createdLandlordId?: string | null
  error?:             string
}

export async function resolveSelfLandlord(
  db: Db,
  orgId: string,
  userId: string,
): Promise<ResolveLandlordResult> {
  const { data: profile, error: profErr } = await db
    .from("user_profiles")
    .select("full_name, mobile, phone, self_landlord_id")
    .eq("id", userId)
    .maybeSingle()
  if (profErr) {
    console.error("resolveSelfLandlord: profile read failed:", profErr.message)
    return { ok: false, error: "Failed to read your profile" }
  }
  if (profile?.self_landlord_id) {
    return { ok: true, landlordId: profile.self_landlord_id as string }   // already bound — reuse
  }

  const fullName  = ((profile?.full_name as string | null) ?? "").trim()
  const firstName = fullName ? fullName.split(/\s+/)[0] : null
  const lastName  = fullName.includes(" ") ? fullName.slice(fullName.indexOf(" ") + 1).trim() : null
  const phone     = (profile?.mobile as string | null) ?? (profile?.phone as string | null) ?? null

  const { data: contact, error: contactErr } = await db.from("contacts").insert({
    org_id:        orgId,
    entity_type:   "individual",
    primary_role:  "landlord",
    first_name:    firstName,
    last_name:     lastName,
    primary_phone: phone,
    created_by:    userId,
  }).select("id").single()
  if (contactErr || !contact) {
    console.error("resolveSelfLandlord: self-landlord contact insert failed:", contactErr?.message)
    return { ok: false, error: "Failed to create your owner record" }
  }

  const { data: landlord, error: landlordErr } = await db.from("landlords").insert({
    org_id:     orgId,
    contact_id: contact.id,
    created_by: userId,
  }).select("id").single()
  if (landlordErr || !landlord) {
    console.error("resolveSelfLandlord: self-landlord insert failed:", landlordErr?.message)
    await db.from("contacts").delete().eq("id", contact.id).eq("org_id", orgId)   // roll back orphan
    return { ok: false, error: "Failed to create your owner record" }
  }

  // Bind only on Owner tier (D-01C-10). Non-fatal if it fails: the landlord exists and the property
  // links to it; only the sync binding is missed (reconcile_self_landlord_bindings can repair).
  const tier = await getOrgTierCanonical(orgId)
  if (tier === "owner") {
    const { error: bindErr } = await db
      .from("user_profiles")
      .update({ self_landlord_id: landlord.id })
      .eq("id", userId)
    if (bindErr) {
      console.error("resolveSelfLandlord: self-landlord binding failed:", bindErr.message)
    }
  }

  return {
    ok:                true,
    landlordId:        landlord.id as string,
    createdContactId:  contact.id as string,
    createdLandlordId: landlord.id as string,
  }
}
