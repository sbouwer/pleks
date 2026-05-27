/**
 * lib/auth/mfa-host.ts — TOTP factor host-scoping (§5 ADDENDUM_AUTH_RESOLVER)
 *
 * Notes:  Supabase TOTP factors have no native host binding. We encode the host in
 *         the factor's friendly_name field at enrolment time and filter by it at
 *         verification time. This mirrors the WebAuthn RP-ID host-scoping from BUILD_62.
 *         Preview deploys (*.vercel.app) are refused enrolment — same as D-AUTH-02.
 */
import type { Factor } from "@supabase/supabase-js"

export const ALLOWED_HOSTS = ["app.pleks.co.za", "localhost", "127.0.0.1"] as const

export type AllowedHost = typeof ALLOWED_HOSTS[number]

/** Separator used to embed the host claim inside a factor friendly_name. */
const HOST_SEPARATOR = " @ "

/**
 * Resolves the current host from a request URL.
 * Returns null for unknown hosts (including *.vercel.app preview deploys).
 */
export function resolveCurrentHost(req: Request): AllowedHost | null {
  try {
    const url = new URL(req.url)
    const hostname = url.hostname.toLowerCase()
    if ((ALLOWED_HOSTS as readonly string[]).includes(hostname)) return hostname as AllowedHost
  } catch {
    // malformed URL
  }
  return null
}

/**
 * Returns true when the host is a Vercel preview deploy.
 * Enrolment is refused on preview hosts to match D-AUTH-02 passkey rule.
 */
export function isPreviewHost(req: Request): boolean {
  try {
    const hostname = new URL(req.url).hostname.toLowerCase()
    return hostname.endsWith(".vercel.app")
  } catch {
    return false
  }
}

/**
 * Builds a friendly_name that embeds the host claim.
 * Example: "Primary device @ app.pleks.co.za"
 */
export function buildFactorFriendlyName(userLabel: string, host: AllowedHost): string {
  return `${userLabel}${HOST_SEPARATOR}${host}`
}

/**
 * Parses the host claim from an existing factor's friendly_name.
 * Returns null when no claim is present (legacy factor, no host encoded).
 */
export function parseFactorHost(friendlyName: string | null | undefined): AllowedHost | null {
  if (!friendlyName) return null
  const idx = friendlyName.lastIndexOf(HOST_SEPARATOR)
  if (idx === -1) return null
  const candidate = friendlyName.slice(idx + HOST_SEPARATOR.length).toLowerCase()
  return (ALLOWED_HOSTS as readonly string[]).includes(candidate) ? candidate as AllowedHost : null
}

/**
 * Filters a list of factors to those enrolled on the current host.
 * Factors with no host claim (legacy) are treated as unscoped and excluded —
 * the migration script (scripts/migrate-totp-host-claims.ts) should default them
 * to 'localhost' before this filter is run in production.
 */
export function filterFactorsByHost(factors: Factor[], currentHost: AllowedHost): Factor[] {
  return factors.filter((f) => parseFactorHost(f.friendly_name) === currentHost)
}
