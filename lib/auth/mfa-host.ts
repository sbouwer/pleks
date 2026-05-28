/**
 * lib/auth/mfa-host.ts — Host identification for TOTP enrolment guard
 *
 * Notes:  D1 (ADDENDUM_AUTH_CONTRACT): host-scoped factor filtering deleted.
 *         One email = one org = one host (I-4); host-scoping was a dev-topology
 *         artefact, not a business concern.
 *         This file is now host *identification* only (for isPreviewHost guard).
 *         Passkeys remain host-bound via WebAuthn RP-ID — intrinsic, unaffected.
 */

export const ALLOWED_HOSTS = ["app.pleks.co.za", "localhost", "127.0.0.1"] as const

export type AllowedHost = typeof ALLOWED_HOSTS[number]

/**
 * Resolves the current host from a request.
 * Reads the Host header first — authoritative on Vercel where request.url carries
 * an internal routing address, not the public hostname. Falls back to URL hostname
 * for client-side constructed requests (new Request(globalThis.location.href)).
 * Returns null for unknown hosts (including *.vercel.app preview deploys).
 */
export function resolveCurrentHost(req: Request): AllowedHost | null {
  try {
    const fromHeader = req.headers.get("host")?.split(":")[0]?.toLowerCase()
    if (fromHeader && (ALLOWED_HOSTS as readonly string[]).includes(fromHeader)) {
      return fromHeader as AllowedHost
    }
    const fromUrl = new URL(req.url).hostname.toLowerCase()
    if ((ALLOWED_HOSTS as readonly string[]).includes(fromUrl)) return fromUrl as AllowedHost
  } catch {
    // malformed URL
  }
  return null
}

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
