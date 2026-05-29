/**
 * Validates a redirect URL to prevent open-redirect phishing attacks
 * AND to prevent auth-flow internals from being used as loop targets.
 *
 * Only allows same-origin relative paths (must start with / but not // or /\)
 * AND rejects auth-flow internals (welcome, resolver, login, onboarding, etc.)
 * which would create redirect loops if used as destinations.
 */

// Paths that are auth-flow machinery, never legitimate post-auth destinations.
// Using them as a ?redirect= target is always a loop bug.
const AUTH_INTERNAL_PREFIXES = [
  "/welcome",
  "/auth/resolver",
  "/auth/callback",
  "/auth/verify",
  "/login",
  "/onboarding",
] as const

function isAuthInternal(path: string): boolean {
  // Strip query string + fragment before matching so /welcome?redirect=… matches /welcome.
  const justPath = path.split("?")[0].split("#")[0]
  // startsWith(p + "/") prevents /welcomers from matching /welcome
  return AUTH_INTERNAL_PREFIXES.some(
    (p) => justPath === p || justPath.startsWith(p + "/")
  )
}

export function safeRedirect(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback
  if (!value.startsWith("/")) return fallback      // must be path-relative
  if (value.startsWith("//")) return fallback      // protocol-relative (evil.com quirk)
  if (value.startsWith("/\\")) return fallback     // Safari backslash normalisation quirk
  if (isAuthInternal(value)) return fallback       // auth-flow internals are never destinations
  return value
}
