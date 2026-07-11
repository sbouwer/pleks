"use server"

/**
 * lib/actions/emailVerification.ts — soft email-ownership verification (non-blocking)
 *
 * Auth:   gateway() session.
 * Data:   user_profiles.email_verified_at (NULL until the user clicks the verification magic link).
 * Notes:  Signup uses admin.createUser({ email_confirm: true }) so the user can work immediately (low churn)
 *         — but that auto-confirms the email, proving nothing. This adds a SOFT verification: send a Supabase
 *         magic link to the address; clicking it (→ /auth/callback?verify_email=1, the proven in-manifest
 *         handler) stamps email_verified_at. Never blocks access; a notice nudges, escalating after a grace.
 */
import { createClient } from "@/lib/supabase/server"
import { gateway } from "@/lib/supabase/gateway"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"

const GRACE_MS = 2 * 24 * 60 * 60 * 1000  // 2 days before the notice escalates

/** Send (or resend) the verification magic link to the signed-in user's email. */
export async function sendEmailVerification(): Promise<{ ok: true } | { error: string }> {
  const supa = await createClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user?.email) return { error: "Not signed in" }
  const { error } = await supa.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false, emailRedirectTo: absoluteUrl("/auth/callback?verify_email=1") },
  })
  if (error) return { error: error.message }
  return { ok: true }
}

export interface EmailVerificationState {
  pending: boolean   // email not yet verified
  overdue: boolean   // unverified AND the account is older than the grace window (escalate the notice)
  email: string | null
}

/** Whether the current user's email is still unverified (and whether the grace window has lapsed). */
export async function getEmailVerificationState(): Promise<EmailVerificationState> {
  const gw = await gateway()
  if (!gw) return { pending: false, overdue: false, email: null }
  const { data, error } = await gw.db
    .from("user_profiles").select("email_verified_at, created_at").eq("id", gw.userId).maybeSingle()
  if (error) { console.error("getEmailVerificationState:", error.message); return { pending: false, overdue: false, email: gw.email } }
  if (!data || (data as { email_verified_at: string | null }).email_verified_at) {
    return { pending: false, overdue: false, email: gw.email }
  }
  const createdAt = (data as { created_at: string | null }).created_at
  const overdue = createdAt ? Date.now() - new Date(createdAt).getTime() > GRACE_MS : false
  return { pending: true, overdue, email: gw.email }
}
