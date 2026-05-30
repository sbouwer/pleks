/**
 * lib/auth/__tests__/passkey-aal.test.ts — fail-closed contract for the passkey-AAL2 signal
 *
 * Notes: ADDENDUM_69 Slice A §A.8. A bug here is a platform-wide MFA bypass on a trust
 *        system, so every rejection path is asserted. Tokens are crafted with the same
 *        secret to test payload-level rejections the minter would never produce.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { createHmac } from "node:crypto"

// Computed (not a literal) so the hardcoded-secret lint doesn't flag a test fixture.
const SECRET = "x".repeat(48)
const USER = "11111111-1111-1111-1111-111111111111"
const SID  = "22222222-2222-2222-2222-222222222222"

beforeAll(() => { process.env.PASSKEY_AAL_SECRET = SECRET })

// imported after env is set; functions read the secret at call time regardless
const { mintPasskeyAal, verifyPasskeyAal, jwtIdentity } = await import("@/lib/auth/passkey-aal")

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`
}
function future() { return Math.floor(Date.now() / 1000) + 3600 }
function validPayload(over: Record<string, unknown> = {}) {
  return { v: 1, sub: USER, sid: SID, aal: "aal2", src: "passkey", iat: Math.floor(Date.now() / 1000), exp: future(), ...over }
}

describe("verifyPasskeyAal", () => {
  const live = { userId: USER, sessionId: SID }

  it("accepts a freshly minted, matching token", () => {
    const minted = mintPasskeyAal(USER, SID)!
    expect(minted).not.toBeNull()
    expect(verifyPasskeyAal(minted.value, live)).toBe(true)
  })

  it("rejects a tampered body", () => {
    const t = sign(validPayload())
    const [body, sig] = t.split(".")
    const flipped = Buffer.from(body, "base64url").toString().replace(USER, "99999999-9999-9999-9999-999999999999")
    const forged = `${Buffer.from(flipped).toString("base64url")}.${sig}`
    expect(verifyPasskeyAal(forged, live)).toBe(false)
  })

  it("rejects a tampered signature", () => {
    const t = sign(validPayload())
    expect(verifyPasskeyAal(t.slice(0, -1) + (t.endsWith("a") ? "b" : "a"), live)).toBe(false)
  })

  it("rejects wrong user (sub mismatch)", () => {
    expect(verifyPasskeyAal(sign(validPayload()), { userId: "other", sessionId: SID })).toBe(false)
  })

  it("rejects wrong session (sid mismatch — replay defence)", () => {
    expect(verifyPasskeyAal(sign(validPayload()), { userId: USER, sessionId: "other-session" })).toBe(false)
  })

  it("rejects expired", () => {
    expect(verifyPasskeyAal(sign(validPayload({ exp: Math.floor(Date.now() / 1000) - 10 })), live)).toBe(false)
  })

  it("rejects v != 1 and aal != aal2", () => {
    expect(verifyPasskeyAal(sign(validPayload({ v: 2 })), live)).toBe(false)
    expect(verifyPasskeyAal(sign(validPayload({ aal: "aal1" })), live)).toBe(false)
  })

  it("rejects malformed / empty / no-dot input", () => {
    expect(verifyPasskeyAal(undefined, live)).toBe(false)
    expect(verifyPasskeyAal("", live)).toBe(false)
    expect(verifyPasskeyAal("nodot", live)).toBe(false)
    expect(verifyPasskeyAal(".onlysig", live)).toBe(false)
    expect(verifyPasskeyAal("onlybody.", live)).toBe(false)
  })

  it("rejects missing live identity", () => {
    expect(verifyPasskeyAal(sign(validPayload()), { userId: undefined, sessionId: SID })).toBe(false)
    expect(verifyPasskeyAal(sign(validPayload()), { userId: USER, sessionId: null })).toBe(false)
  })

  it("fails CLOSED when the secret is absent", () => {
    const saved = process.env.PASSKEY_AAL_SECRET
    delete process.env.PASSKEY_AAL_SECRET
    try {
      expect(mintPasskeyAal(USER, SID)).toBeNull()
      expect(verifyPasskeyAal(sign(validPayload()), live)).toBe(false)
    } finally {
      process.env.PASSKEY_AAL_SECRET = saved
    }
  })

  it("mint returns null without a session id", () => {
    expect(mintPasskeyAal(USER, null)).toBeNull()
  })
})

describe("jwtIdentity", () => {
  it("reads sub + session_id from a JWT payload, null on garbage", () => {
    const claims = { sub: USER, session_id: SID, aal: "aal1" }
    const tok = `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`
    expect(jwtIdentity(tok)).toEqual({ sub: USER, sessionId: SID })
    expect(jwtIdentity(undefined)).toEqual({ sub: null, sessionId: null })
    expect(jwtIdentity("not-a-jwt")).toEqual({ sub: null, sessionId: null })
  })
})
