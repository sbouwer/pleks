/**
 * lib/auth/passkeys/encoding.ts — WebAuthn binary ⇄ base64url text
 *
 * Passkey binary fields (passkey_challenges.challenge, user_passkeys.credential_id,
 * user_passkeys.public_key) are stored as base64url TEXT, NOT bytea. supabase-js
 * JSON-serialises a Node Buffer to {"type":"Buffer","data":[...]} on insert (which
 * corrupts a bytea column), and PostgREST returns bytea as a "\x…"-hex string on read —
 * both broke verification (passkeys never enrolled). base64url text passes straight
 * through and is exactly what @simplewebauthn produces/consumes.
 *
 * NEVER reintroduce `x as unknown as Uint8Array` on these columns — use these helpers.
 */
export function bytesToB64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}

// Returns a Uint8Array backed by a plain ArrayBuffer (not Node's pooled SharedArrayBuffer-
// like Buffer), so it satisfies @simplewebauthn's Uint8Array<ArrayBuffer> publicKey type
// without a cast at the call site.
export function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(value, "base64url")
  const out = new Uint8Array(buf.byteLength)
  out.set(buf)
  return out
}
