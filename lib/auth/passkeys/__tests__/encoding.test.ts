/**
 * lib/auth/passkeys/__tests__/encoding.test.ts
 *
 * Guards the base64url ⇄ bytes round-trip that backs passkey storage. The columns are
 * base64url TEXT (not bytea) precisely because the old bytea path corrupted the data;
 * these helpers are the only sanctioned way to cross the boundary.
 */
import { describe, it, expect } from "vitest"
import { bytesToB64url, b64urlToBytes } from "../encoding"

describe("passkey encoding", () => {
  it("round-trips arbitrary bytes exactly", () => {
    const bytes = new Uint8Array([141, 255, 38, 77, 95, 67, 110, 0, 1, 250, 13])
    expect(Array.from(b64urlToBytes(bytesToB64url(bytes)))).toEqual(Array.from(bytes))
  })

  it("emits url-safe base64 (no +, /, or = padding)", () => {
    const bytes = new Uint8Array([251, 255, 254, 253, 252]) // would yield +,/ in std base64
    expect(bytesToB64url(bytes)).not.toMatch(/[+/=]/)
  })

  it("decodes a base64url string identically to @simplewebauthn's expectation", () => {
    const s = "jf8mTV9Dbg" // base64url, no padding — the shape a WebAuthn challenge takes
    expect(Array.from(b64urlToBytes(s))).toEqual(Array.from(new Uint8Array(Buffer.from(s, "base64url"))))
  })
})
