/**
 * lib/auth/step-up.ts — Step-up challenge engine for sensitive server actions
 *
 * Data:  Reads/writes step_up_challenges table via service-role client.
 * Notes: Tokens are single-use (consumed_at) and expire in 15 min server-side.
 *        Verified challenges have an additional 5-min window after verification.
 */
import crypto from "crypto"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export type StepUpAction =
  | "trust_account_write"
  | "deposit_refund_approval"
  | "bank_detail_change"
  | "team_role_change"
  | "subscription_change"
  | "tenant_data_deletion"
  | "ownership_transfer"
  | "security_settings_change"
  | "passkey_unenroll"
  | "totp_unenroll"
  | "bulk_export"

interface RequireStepUpParams {
  userId: string
  action: StepUpAction
  resourceId?: string
  providedToken: string | null | undefined
}

type StepUpResult =
  | { verified: true }
  | { verified: false; challengeToken: string }

export async function requireStepUp(params: RequireStepUpParams): Promise<StepUpResult> {
  const { userId, action, resourceId, providedToken } = params
  const db = await createServiceClient()

  if (!providedToken) {
    // Issue a fresh challenge
    const token = crypto.randomBytes(32).toString("hex")
    const { error } = await db.from("step_up_challenges").insert({
      user_id:         userId,
      action,
      resource_id:     resourceId ?? null,
      challenge_token: token,
    })
    if (error) console.error("[step_up] insert challenge failed:", error.message)
    return { verified: false, challengeToken: token }
  }

  // Validate the provided token
  const { data: challenge, error } = await db
    .from("step_up_challenges")
    .select("id, user_id, action, expires_at, verified_at, consumed_at")
    .eq("challenge_token", providedToken)
    .maybeSingle()

  if (error || !challenge) return { verified: false, challengeToken: providedToken }

  if (
    challenge.user_id !== userId ||
    challenge.action !== action ||
    !challenge.verified_at ||
    challenge.consumed_at
  ) {
    return { verified: false, challengeToken: providedToken }
  }

  const expiresAt = new Date(challenge.expires_at).getTime()
  const verifiedAt = new Date(challenge.verified_at).getTime()
  const now = Date.now()

  if (now > expiresAt || now - verifiedAt > 5 * 60 * 1000) {
    return { verified: false, challengeToken: providedToken }
  }

  // Consume the token
  await db
    .from("step_up_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)

  return { verified: true }
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
