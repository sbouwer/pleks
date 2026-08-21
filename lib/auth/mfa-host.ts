/**
 * lib/auth/mfa-host.ts — Host identification for TOTP enrolment guard
 *
 * Notes:  D1 (ADDENDUM_AUTH_CONTRACT): host-scoped factor filtering deleted.
 *         One email = one org = one host (I-4); host-scoping was a dev-topology
 *         artefact, not a business concern.
 *         This file is now host *identification* only (for isPreviewHost guard).
 *         Passkeys remain host-bound via WebAuthn RP-ID — intrinsic, unaffected.
 *         The ALLOWED_HOSTS list and its AllowedHost type were the last residue of that deleted
 *         host-scoping and had no callers left; both removed 2026-08-21. `isPreviewHost` tests a
 *         suffix, not membership of a list, so nothing here needs the allowlist back.
 */

/**
 * Returns true when the host is a Vercel preview deploy.
 * Enrolment is refused on preview hosts (D-AUTH-02).
 */
export function isPreviewHost(req: Request): boolean {
  try {
    const hostname = new URL(req.url).hostname.toLowerCase()
    return hostname.endsWith(".vercel.app")
  } catch {
    return false
  }
}
