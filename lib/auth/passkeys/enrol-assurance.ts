/**
 * lib/auth/passkeys/enrol-assurance.ts — may this session MINT a passkey?
 *
 * Auth:   the policy behind POST /api/auth/passkeys/registration-options and .../registration-verify
 * Data:   reads user_passkeys (count only) via service-role; step_up_challenges via lib/auth/step-up
 * Notes:  dev-standards L-72 / M-127. Authorise a credential-MINTING operation on the state of the
 *         ACCOUNT, never on the state of the session.
 *
 * WHY THIS EXISTS. Revoking a passkey demanded step-up; enrolling one demanded nothing but a live
 * session. The guard sat on the half that DESTROYS a credential, and minting is the half that grants
 * privilege — a passkey added today is a login tomorrow, and on an agent session it also issues AAL2
 * on the spot (registration-verify, ADDENDUM_69 Slice A). The asymmetry is the default rather than an
 * oversight, in L-72's words: destructive verbs advertise their danger and reviewers guard them,
 * while "add a device" reads as a preference.
 *
 * THE RULE, and the bootstrap case that shapes it:
 *   NO assurance factor   → a bare session may enrol. It has to: enrolling requires being signed in,
 *   at all                  so the FIRST credential cannot demand what every later one should, and
 *                           there is genuinely nothing to assure with.
 *   any factor at all     → step-up. The user CAN prove possession, so make them — by passkey
 *                           (/api/auth/step-up/passkey) or TOTP (/api/auth/step-up). Neither is a
 *                           standing fallback credential.
 *
 * "ANY FACTOR" MEANS TOTP TOO, AND COUNTING ONLY PASSKEYS WAS THIS GUARD'S OWN FIRST BUG.
 * The first version asked "does this account hold a PASSKEY?", justified by the sentence above about
 * having nothing to assure with. For a TOTP-only agent — the older majority, since `manifest.ts`
 * marks every agent route `requiresAal2` — that sentence is simply false: there IS something to
 * assure with, and StepUpModal already verifies it. So a stolen AAL1 session hit registration-options
 * and registration-verify, was waved through as "bootstrap" both times, minted a permanent passkey,
 * and took an AAL2 grant with it (registration-verify → issuePasskeyAal → lib/auth/facts.ts), all
 * without ever knowing the TOTP secret. That is verbatim the attack M-127 exists to close, surviving
 * the fix aimed at it. L-72 asks whether the account already possesses "a credential of this kind";
 * the operative reading is the ASSURANCE the account can offer, not the credential's type — read it
 * narrowly and every account with a different second factor is a bootstrap account.
 * Found by adversarial review before the branch was pushed, not in production.
 *
 * ACCOUNT-WIDE, NOT rp-SCOPED, and the distinction is deliberate. `registration-options` counts
 * existing keys filtered by `rp_id` — that count is for WebAuthn's `excludeCredentials`, a
 * same-device duplicate guard, and is never an authorization input. This count is the authorization
 * input, so it asks L-72's question as L-72 asks it: does this ACCOUNT already possess a credential
 * of this kind? A narrower per-rp count would let a second rp start from the bootstrap state.
 *
 * ONE GUARD, BOTH HALVES OF THE CEREMONY. `options` issues the WebAuthn challenge and `verify`
 * redeems it. Both call this; only `verify` consumes the step-up token, because a single-use token
 * cannot satisfy two calls. Checking at `options` is not belt-and-braces — it is what stops the user
 * completing a biometric prompt before being told they need to re-authenticate, and it means the
 * challenge cannot be issued under one rule and redeemed under a weaker one.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { stepUpTokenIsVerified, issueStepUpChallenge, consumeStepUpChallenge } from "@/lib/auth/step-up"

export type EnrolAssurance =
  | { ok: true; bootstrap: boolean }
  | { ok: false; challengeToken: string | null; error?: string }

/** Active (unrevoked) passkeys on the account, across every rp. */
export async function countActivePasskeys(userId: string): Promise<number> {
  const db = await createServiceClient()
  const { count, error } = await db
    .from("user_passkeys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null)

  // FAIL CLOSED. An unreadable count is not a zero: reading it as one would turn a database blip
  // into "this account has no credentials, let anything enrol" — the exact bypass this guard exists
  // to remove. -1 is unrepresentable as a real count and every caller treats it as "assurance
  // required".
  //
  // ⚠ THE COST, STATED PROPERLY. An earlier version of this comment said the worst case was "asks a
  // legitimate user for a code they can supply". That is false for the account most likely to be
  // enrolling: a first-time user with no passkey and no TOTP is asked to satisfy a challenge they
  // have no factor for — StepUpModal hides its passkey button and /api/auth/step-up answers "No TOTP
  // factor enrolled". They are blocked until the read recovers. That is the right direction to fail
  // in, and it is a real outage for that user, not a mild prompt.
  if (error) {
    console.error("[passkey_enrol] active-passkey count failed:", error.message)
    return -1
  }
  return count ?? 0
}

/**
 * Verified TOTP factors on the account. Same fail-closed contract as the passkey count: -1 means
 * "could not tell", never "none". Read through the SERVICE client's admin API rather than the
 * caller's session (`supabase.auth.mfa.listFactors()`), because this is a question about the ACCOUNT
 * — a session-scoped read would answer for whoever is holding the session, which is precisely the
 * thing under suspicion here.
 */
export async function countVerifiedTotpFactors(userId: string): Promise<number> {
  const db = await createServiceClient()
  const { data, error } = await db.auth.admin.mfa.listFactors({ userId })
  if (error || !data) {
    console.error("[passkey_enrol] TOTP factor list failed:", error?.message ?? "no data")
    return -1
  }
  // listFactors returns every factor type together; unverified enrolments were never completed and
  // cannot satisfy a challenge, so they are not assurance.
  return data.factors.filter(f => f.factor_type === "totp" && f.status === "verified").length
}

/**
 * @param consume `true` at the mint (registration-verify) — spends the token. `false` at
 *        registration-options, which only reports whether assurance is still outstanding.
 */
export async function requirePasskeyEnrolAssurance(params: {
  userId: string
  providedToken: string | null | undefined
  consume: boolean
}): Promise<EnrolAssurance> {
  const { userId, providedToken, consume } = params

  // Both reads, always — `bootstrap` is a claim about the whole account, and a -1 from either side
  // is enough to withhold it. Deliberately not short-circuited on `passkeys === 0`: that ordering
  // reads as an optimisation and quietly reintroduces the passkeys-only test this guard was fixed for.
  const [passkeys, totp] = await Promise.all([countActivePasskeys(userId), countVerifiedTotpFactors(userId)])
  if (passkeys === 0 && totp === 0) return { ok: true, bootstrap: true }

  if (!providedToken) {
    const token = await issueStepUpChallenge({ userId, action: "passkey_enroll" })
    return token
      ? { ok: false, challengeToken: token }
      : { ok: false, challengeToken: null, error: "Could not start re-authentication. Please try again." }
  }

  const seen = await stepUpTokenIsVerified({ userId, action: "passkey_enroll", providedToken })
  // Hand the SAME token back rather than minting a second one: the client is mid-modal with this
  // one, and a fresh token would orphan the challenge the user is about to satisfy.
  //
  // The `error` matters most on the path that reads worst. A step-up token is only valid for five
  // minutes from ISSUANCE, and the slowest legitimate ceremony — cross-device hybrid, scan a QR with
  // a phone, unlock it, approve — can outrun that. The refusal then lands at registration-verify,
  // AFTER the browser ceremony, and without a message the client showed "Verification failed" for
  // something that was never a verification problem. Naming expiry is the difference between "retry,
  // it will work" and "your passkey is broken".
  if (!seen.ok) {
    return {
      ok: false,
      challengeToken: providedToken,
      error: "Your re-authentication expired or wasn't completed. Please try again.",
    }
  }

  if (consume) await consumeStepUpChallenge(seen.challengeId)
  return { ok: true, bootstrap: false }
}
