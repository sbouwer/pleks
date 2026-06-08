/**
 * lib/agent/resolveAgentContact.ts — the agent's own person contact (ADDENDUM_AGENT_CONTACT_IDENTITY)
 *
 * Notes:  Every user IS an agent (user_orgs membership) with their own individual contact
 *         (primary_role='agent') — their identity as a person, independent of any landlord role. Bound via
 *         user_profiles.agent_contact_id. Created at onboarding; this is the idempotent create-or-resolve
 *         safety net (an existing binding is reused, so it never makes a second agent contact). Settings →
 *         My profile reads/writes this contact. Seeded from user_profiles (name/phone). Landlord-ness is a
 *         separate, optional determination (self_landlord_id) — see [[project_pleks_agent_landlord_identity]]
 *         / resolveSelfLandlord, which this mirrors.
 */
import type { GatewayContext } from "@/lib/supabase/gateway"

type Db = GatewayContext["db"]

export interface ResolveAgentContactResult {
  ok: boolean
  contactId?: string | null
  /** Set only when this call created the contact row (so a caller can roll back on a later failure). */
  created?: boolean
  error?: string
}

export async function resolveAgentContact(
  db: Db,
  orgId: string,
  userId: string,
  email?: string | null,
): Promise<ResolveAgentContactResult> {
  const { data: profile, error: profErr } = await db
    .from("user_profiles")
    .select("agent_contact_id, full_name, first_name, last_name, title, mobile, phone")
    .eq("id", userId)
    .maybeSingle()
  if (profErr) {
    console.error("resolveAgentContact: profile read failed:", profErr.message)
    return { ok: false, error: "Failed to read your profile" }
  }
  if (profile?.agent_contact_id) {
    return { ok: true, contactId: profile.agent_contact_id as string }   // already bound — reuse
  }

  const fullName  = ((profile?.full_name as string | null) ?? "").trim()
  const firstName = (profile?.first_name as string | null)
    ?? (fullName ? fullName.split(/\s+/)[0] : null)
  const lastName  = (profile?.last_name as string | null)
    ?? (fullName.includes(" ") ? fullName.slice(fullName.indexOf(" ") + 1).trim() : null)
  const phone     = (profile?.mobile as string | null) ?? (profile?.phone as string | null) ?? null

  const { data: contact, error: contactErr } = await db.from("contacts").insert({
    org_id:        orgId,
    entity_type:   "individual",
    primary_role:  "agent",
    title:         (profile?.title as string | null) ?? null,
    first_name:    firstName,
    last_name:     lastName,
    primary_email: email?.trim() || null,
    primary_phone: phone,
    created_by:    userId,
  }).select("id").single()
  if (contactErr || !contact) {
    console.error("resolveAgentContact: agent contact insert failed:", contactErr?.message)
    return { ok: false, error: "Failed to create your profile record" }
  }

  const { error: bindErr } = await db
    .from("user_profiles")
    .update({ agent_contact_id: contact.id })
    .eq("id", userId)
  if (bindErr) {
    console.error("resolveAgentContact: agent_contact_id binding failed:", bindErr.message)
    await db.from("contacts").delete().eq("id", contact.id).eq("org_id", orgId)   // roll back orphan
    return { ok: false, error: "Failed to create your profile record" }
  }

  return { ok: true, contactId: contact.id as string, created: true }
}
