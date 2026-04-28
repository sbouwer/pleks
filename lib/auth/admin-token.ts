/**
 * HMAC-signed admin session tokens.
 * Uses Web Crypto API — compatible with both Edge and Node.js 18+ runtimes.
 *
 * Replaces the previous pattern of storing ADMIN_SECRET directly as the cookie
 * value. The cookie now contains a signed, expiring token. The secret never
 * leaves the server.
 */

async function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  )
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function b64urlDecode(str: string): Uint8Array {
  return Uint8Array.from(
    atob(str.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  )
}

/** Sign a new 24-hour admin session token. Returns a base64url-encoded token. */
export async function signAdminToken(secret: string): Promise<string> {
  const sid = b64url(crypto.getRandomValues(new Uint8Array(16)).buffer)
  const now = Math.floor(Date.now() / 1000)
  const payload = btoa(JSON.stringify({ sid, iat: now, exp: now + 86400 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
  const key = await importKey(secret, "sign")
  const sig = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))
  return `${payload}.${sig}`
}

/** Verify an admin token. Returns false if missing, malformed, expired, or signature invalid. */
export async function verifyAdminToken(token: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!token || !secret) return false
  const dot = token.lastIndexOf(".")
  if (dot === -1) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const parsed = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number }
    if (!parsed.exp || Date.now() / 1000 > parsed.exp) return false
    const key = await importKey(secret, "verify")
    const sigBytes = b64urlDecode(sig)
    return await crypto.subtle.verify("HMAC", key, sigBytes.buffer as ArrayBuffer, new TextEncoder().encode(payload))
  } catch {
    return false
  }
}
