/**
 * lib/auth/mfaVerifyDecision.ts — the /login/mfa stay-vs-enrol decision (FIX-70)
 *
 * Notes:  Mirrors the resolver's hasVerifiedFactor predicate so the verify page and the resolver can
 *         never diverge: a verified TOTP factor OR an unrevoked passkey means "stay and verify"; only
 *         when NEITHER exists does the page hand off to enrolment — and always to the CHOOSER
 *         (/settings/security/enrol, passkey OR authenticator), never the TOTP-only enrol-totp page.
 *         Extracted as a pure function so the client branch the resolver-convergence tests can't reach
 *         is unit-testable — that blind spot is exactly what hid the original passkey-blind bug.
 */
import { safeRedirect } from "./safe-redirect"

/** True only when the user has NEITHER a verified TOTP factor NOR a passkey → must enrol. */
export function mfaVerifyNeedsEnrol(
  { totpVerified, passkeyExists }: { totpVerified: boolean; passkeyExists: boolean },
): boolean {
  return !totpVerified && !passkeyExists
}

/** The factor chooser path (never enrol-totp), carrying the post-enrol destination. */
export function enrolChooserPath(
  redirectParam: string | null | undefined,
  opts?: { mandatory?: boolean },
): string {
  const redirect = encodeURIComponent(safeRedirect(redirectParam))
  const prefix = opts?.mandatory ? "mandatory=true&" : ""
  return `/settings/security/enrol?${prefix}redirect=${redirect}`
}
