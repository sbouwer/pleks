/**
 * Validates a redirect URL to prevent open-redirect phishing attacks.
 * Only allows same-origin relative paths (must start with / but not // or /\).
 */
export function safeRedirect(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback
  if (!value.startsWith("/")) return fallback      // must be path-relative
  if (value.startsWith("//")) return fallback      // protocol-relative (evil.com quirk)
  if (value.startsWith("/\\")) return fallback     // Safari backslash normalisation quirk
  return value
}
