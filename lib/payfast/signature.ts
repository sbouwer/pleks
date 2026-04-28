/**
 * lib/payfast/signature.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createHash } from "node:crypto"

export function generatePayFastSignature(
  data: Record<string, string>,
  passphrase?: string
): string {
  const sortedKeys = Object.keys(data)
    .filter((key) => key !== "signature" && data[key] !== "")
    .sort((a, b) => a.localeCompare(b))

  const queryString = sortedKeys
    .map((key) => `${key}=${encodeURIComponent(data[key]).replaceAll("%20", "+")}`)
    .join("&")

  const withPassphrase = passphrase
    ? `${queryString}&passphrase=${encodeURIComponent(passphrase).replaceAll("%20", "+")}`
    : queryString

  // eslint-disable-next-line sonarjs/hashing -- MD5 is mandated by the PayFast API signature spec; not used for security
  return createHash("md5").update(withPassphrase).digest("hex")
}
