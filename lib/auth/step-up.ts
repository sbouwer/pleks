/**
 * lib/auth/step-up.ts — Step-up challenge engine for sensitive server actions
 *
 * Data:  Reads/writes step_up_challenges table via service-role client.
 * Notes: Tokens are single-use (consumed_at) and expire in 15 min server-side.
 *        Verified challenges have an additional 5-min window after verification.
 */
import crypto from "crypto"
import { createServiceClient } from "@/lib/supabase/server"

export type StepUpAction =
  | "trust_account_write"
  | "deposit_refund_approval"
  | "bank_detail_change"
  | "team_role_change"
  | "subscription_change"
  | "tenant_data_deletion"
  | "ownership_transfer"
  | "security_settings_change"
  | "passkey_enroll"
  | "passkey_unenroll"
  | "totp_unenroll"
  | "bulk_export"

// ⚠ THIS UNION HAS A TWIN IN THE DATABASE: `step_up_challenges.action` carries a CHECK constraint
// listing the same strings (010_platform_features.sql §5.2.4). Adding a member here without adding
// it there makes every challenge insert for the new action fail the constraint — and see the
// insert-failure handling below for why that must not be silent. `passkey_enroll` was added
// 2026-09-10 (M-127); the constraint was widened in the same commit, and the migration must reach
// an environment BEFORE the code does.

interface RequireStepUpParams {
  userId: string
  action: StepUpAction
  resourceId?: string
  providedToken: string | null | undefined
}

type StepUpResult =
  | { verified: true }
  // `challengeToken: null` means NO usable challenge exists — issuing one failed. A caller passes
  // this straight to the client as `401 { challengeToken }`, and the client's `if (challengeToken)`
  // then falls through to its error path instead of opening a modal nobody can satisfy.
  | { verified: false; challengeToken: string | null; error?: string }

/**
 * Is `providedToken` a verified, unconsumed, in-window challenge for exactly this user and action?
 * READ-ONLY — it does not consume. `requireStepUp` is this plus consumption, so the two can never
 * disagree about what "verified" means; a second implementation of these checks is how a challenge
 * gets issued under one rule and redeemed under a weaker one.
 */
export async function stepUpTokenIsVerified(params: {
  userId: string
  action: StepUpAction
  providedToken: string | null | undefined
}): Promise<{ ok: true; challengeId: string } | { ok: false }> {
  const { userId, action, providedToken } = params
  if (!providedToken) return { ok: false }

  const db = await createServiceClient()
  const { data: challenge, error } = await db
    .from("step_up_challenges")
    .select("id, user_id, action, expires_at, verified_at, consumed_at")
    .eq("challenge_token", providedToken)
    .maybeSingle()

  if (error || !challenge) return { ok: false }

  if (
    challenge.user_id !== userId ||
    challenge.action !== action ||
    !challenge.verified_at ||
    challenge.consumed_at
  ) {
    return { ok: false }
  }

  const expiresAt = new Date(challenge.expires_at).getTime()
  const verifiedAt = new Date(challenge.verified_at).getTime()
  const now = Date.now()

  if (now > expiresAt || now - verifiedAt > 5 * 60 * 1000) return { ok: false }

  return { ok: true, challengeId: challenge.id }
}

/** Mint a fresh challenge. Returns null if it could not be stored — never a token that does not exist. */
export async function issueStepUpChallenge(params: {
  userId: string
  action: StepUpAction
  resourceId?: string
}): Promise<string | null> {
  const { userId, action, resourceId } = params
  const db = await createServiceClient()
  const token = crypto.randomBytes(32).toString("hex")
  const { error } = await db.from("step_up_challenges").insert({
    user_id:         userId,
    action,
    resource_id:     resourceId ?? null,
    challenge_token: token,
  })
  // ⚠ THE RETURN USED TO BE THE TOKEN REGARDLESS OF `error`. A failed insert then handed the caller
  // a token with no row behind it: the client opened a step-up modal, the verify route answered
  // "Challenge not found", and the action became impossible with no way to tell that from a wrong
  // code. The likeliest cause is the CHECK constraint above rejecting an action the database does
  // not yet know — i.e. exactly the state between a deploy and its migration.
  if (error) {
    console.error("[step_up] insert challenge failed:", error.message)
    return null
  }
  return token
}

/** Spend a challenge. Split out so nothing re-implements "what consuming means" beside a second copy
 *  of the verification rules — the pairing `stepUpTokenIsVerified` + this is the whole protocol. */
export async function consumeStepUpChallenge(challengeId: string): Promise<void> {
  const db = await createServiceClient()
  await db
    .from("step_up_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challengeId)
}

export async function requireStepUp(params: RequireStepUpParams): Promise<StepUpResult> {
  const { userId, action, resourceId, providedToken } = params

  if (!providedToken) {
    const token = await issueStepUpChallenge({ userId, action, resourceId })
    return token
      ? { verified: false, challengeToken: token }
      : { verified: false, challengeToken: null, error: "Could not start re-authentication. Please try again." }
  }

  const seen = await stepUpTokenIsVerified({ userId, action, providedToken })
  if (!seen.ok) return { verified: false, challengeToken: providedToken }

  await consumeStepUpChallenge(seen.challengeId)
  return { verified: true }
}
