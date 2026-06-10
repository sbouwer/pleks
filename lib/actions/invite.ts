"use server"

/**
 * lib/actions/invite.ts — Server-side invite acceptance for new users
 *
 * Auth:   public (token-gated) — no session required on entry
 * Data:   invites (token lookup), auth.users (admin create), user_orgs (service insert),
 *         invites (service update accepted_at)
 * Notes:  New-user path uses admin.createUser({ email_confirm: true }) + signInWithPassword
 *         so the session exists immediately regardless of the project's email-confirm setting.
 *         Mirrors the onboarding.createAccountWithOrg pattern (lib/actions/onboarding.ts:242).
 *         Existing-user path (invitee already authenticated) stays client-side in the page.
 *         Service client used for invite mark-accepted: the user_client UPDATE policy on invites
 *         is restricted to owner/PM roles, so non-owner invitees would silently fail client-side.
 */

import { createClient, createServiceClient } from "@/lib/supabase/server"

export interface AcceptInviteResult {
  role: string
  error?: never
}
export interface AcceptInviteError {
  error: string
  role?: never
}

export async function acceptInviteNewUser(
  token: string,
  fullName: string,
  password: string
): Promise<AcceptInviteResult | AcceptInviteError> {
  const service = await createServiceClient()

  const { data: invite, error: inviteErr } = await service
    .from("invites")
    .select("id, email, role, org_id, accepted_at, expires_at")
    .eq("token", token)
    .single()

  if (inviteErr || !invite) return { error: "Invalid invitation link." }
  if (invite.accepted_at) return { error: "This invitation has already been accepted." }
  if (new Date(invite.expires_at as string) < new Date()) return { error: "This invitation has expired. Ask for a new one." }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: invite.email as string,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (createErr || !created.user) {
    const msg = createErr?.message ?? ""
    if (msg.includes("already been registered") || msg.includes("already exists")) {
      return { error: "This email already has an account. Sign in to accept the invitation." }
    }
    return { error: msg || "Failed to create account." }
  }

  const userId = created.user.id

  // Accepting an emailed invite proves the user owns this inbox — mark email verified so they never see the
  // verification notice (that's for self-signup, where the address is unproven). Upsert keeps any trigger row.
  await service.from("user_profiles").upsert({ id: userId, email_verified_at: new Date().toISOString() }, { onConflict: "id" })

  // Sign in immediately so the client has a session for /welcome
  const supabase = await createClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: invite.email as string,
    password,
  })

  if (signInErr) {
    // Account exists but session failed — still insert membership so the user can log in manually
    console.error("[invite] signInWithPassword failed after createUser:", signInErr.message)
  }

  const { error: orgErr } = await service.from("user_orgs").insert({
    user_id: userId,
    org_id: invite.org_id,
    role: invite.role,
  })

  if (orgErr) {
    console.error("[invite] user_orgs insert failed:", orgErr.message)
    return { error: "Failed to join organisation." }
  }

  const { error: markErr } = await service
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id)

  if (markErr) {
    console.error("[invite] accepted_at update failed:", markErr.message)
  }

  return { role: invite.role as string }
}

export async function acceptInviteExistingUser(
  token: string
): Promise<AcceptInviteResult | AcceptInviteError> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const service = await createServiceClient()

  const { data: invite, error: inviteErr } = await service
    .from("invites")
    .select("id, email, role, org_id, accepted_at, expires_at")
    .eq("token", token)
    .single()

  if (inviteErr || !invite) return { error: "Invalid invitation link." }
  if (invite.accepted_at) return { error: "This invitation has already been accepted." }
  if (new Date(invite.expires_at as string) < new Date()) return { error: "This invitation has expired. Ask for a new one." }
  if (user.email?.toLowerCase() !== (invite.email as string).toLowerCase()) {
    return { error: "This invitation is for a different email address. Please sign out first." }
  }

  const { error: orgErr } = await service.from("user_orgs").insert({
    user_id: user.id,
    org_id: invite.org_id,
    role: invite.role,
  })

  if (orgErr) {
    console.error("[invite] user_orgs insert failed:", orgErr.message)
    return { error: "Failed to join organisation." }
  }

  const { error: markErr } = await service
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id)

  if (markErr) {
    console.error("[invite] accepted_at update failed:", markErr.message)
  }

  return { role: invite.role as string }
}
