/**
 * lib/auth/passkeys/__tests__/enrol-assurance.test.ts — may this session mint a passkey?
 *
 * Notes: M-127 / dev-standards L-72. This guard is the only thing standing between a stolen
 *        session and a permanent login credential, so every branch is asserted in BOTH
 *        directions — the refusals AND the two cases that must still be allowed (bootstrap,
 *        and a verified token), because a guard that refuses everything is not a fix, it is
 *        an outage. The consume/non-consume split is asserted separately: a single-use token
 *        spent at registration-options would make registration-verify unsatisfiable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const USER = "11111111-1111-1111-1111-111111111111"
const TOKEN = "a".repeat(64)

let passkeyCount: { count: number | null; error: { message: string } | null }
let factorList: { data: { factors: Array<{ factor_type: string; status: string }> } | null; error: { message: string } | null }

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: async () => passkeyCount,
        }),
      }),
    }),
    auth: { admin: { mfa: { listFactors: async () => factorList } } },
  }),
}))

const stepUpTokenIsVerified = vi.fn()
const issueStepUpChallenge = vi.fn()
const consumeStepUpChallenge = vi.fn()

vi.mock("@/lib/auth/step-up", () => ({
  stepUpTokenIsVerified: (...a: unknown[]) => stepUpTokenIsVerified(...a),
  issueStepUpChallenge: (...a: unknown[]) => issueStepUpChallenge(...a),
  consumeStepUpChallenge: (...a: unknown[]) => consumeStepUpChallenge(...a),
}))

const { requirePasskeyEnrolAssurance, countActivePasskeys, countVerifiedTotpFactors } =
  await import("@/lib/auth/passkeys/enrol-assurance")

beforeEach(() => {
  passkeyCount = { count: 0, error: null }
  factorList = { data: { factors: [] }, error: null }
  stepUpTokenIsVerified.mockReset().mockResolvedValue({ ok: false })
  issueStepUpChallenge.mockReset().mockResolvedValue(TOKEN)
  consumeStepUpChallenge.mockReset().mockResolvedValue(undefined)
})

describe("countActivePasskeys", () => {
  it("returns the count", async () => {
    passkeyCount = { count: 3, error: null }
    expect(await countActivePasskeys(USER)).toBe(3)
  })

  it("returns -1 on a query error — an unreadable count must never read as zero", async () => {
    passkeyCount = { count: null, error: { message: "boom" } }
    expect(await countActivePasskeys(USER)).toBe(-1)
  })
})

describe("countVerifiedTotpFactors", () => {
  it("counts only VERIFIED totp factors — an abandoned enrolment is not assurance", async () => {
    factorList = { data: { factors: [
      { factor_type: "totp", status: "verified" },
      { factor_type: "totp", status: "unverified" },
      { factor_type: "phone", status: "verified" },
    ] }, error: null }
    expect(await countVerifiedTotpFactors(USER)).toBe(1)
  })

  it("returns -1 when the factor list cannot be read", async () => {
    factorList = { data: null, error: { message: "boom" } }
    expect(await countVerifiedTotpFactors(USER)).toBe(-1)
  })
})

describe("requirePasskeyEnrolAssurance — bootstrap", () => {
  it("permits a bare session when the account has NO passkeys AND no TOTP", async () => {
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: null, consume: true })
    expect(r).toEqual({ ok: true, bootstrap: true })
    expect(issueStepUpChallenge).not.toHaveBeenCalled()
  })

  it("does NOT treat an unreadable count as the bootstrap case", async () => {
    passkeyCount = { count: null, error: { message: "boom" } }
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: null, consume: true })
    expect(r.ok).toBe(false)
  })

  // The bug this guard shipped with, and the one the whole M-127 threat rides on: a TOTP-only
  // account has zero passkeys, so a passkeys-only bootstrap test waved a stolen AAL1 session
  // through and let it mint a passkey — and with it an AAL2 grant — without the TOTP secret.
  it("does NOT treat a TOTP-only account as bootstrap — it has something to assure with", async () => {
    factorList = { data: { factors: [{ factor_type: "totp", status: "verified" }] }, error: null }
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: null, consume: true })
    expect(r).toEqual({ ok: false, challengeToken: TOKEN })
    expect(issueStepUpChallenge).toHaveBeenCalledWith({ userId: USER, action: "passkey_enroll" })
  })

  it("does NOT treat an unreadable FACTOR list as the bootstrap case either", async () => {
    factorList = { data: null, error: { message: "boom" } }
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: null, consume: true })
    expect(r.ok).toBe(false)
  })

  it("reads the factor list even when the passkey count is zero — no short-circuit", async () => {
    factorList = { data: { factors: [{ factor_type: "totp", status: "verified" }] }, error: null }
    await requirePasskeyEnrolAssurance({ userId: USER, providedToken: null, consume: true })
    // If the guard ever short-circuits on `passkeys === 0`, this is the assertion that fails
    // rather than a security property quietly reverting.
    expect(issueStepUpChallenge).toHaveBeenCalled()
  })
})

describe("requirePasskeyEnrolAssurance — the account already has a passkey", () => {
  beforeEach(() => { passkeyCount = { count: 1, error: null } })

  it("refuses a bare session and issues a challenge", async () => {
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: null, consume: true })
    expect(r).toEqual({ ok: false, challengeToken: TOKEN })
    expect(issueStepUpChallenge).toHaveBeenCalledWith({ userId: USER, action: "passkey_enroll" })
  })

  it("returns challengeToken:null with an error when the challenge could not be stored", async () => {
    issueStepUpChallenge.mockResolvedValue(null)
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: null, consume: true })
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ challengeToken: null })
    // A phantom token would open a modal nobody can satisfy; the client needs a falsy token to
    // fall through to its error path.
    expect("error" in r && r.error).toBeTruthy()
  })

  it("hands the SAME token back when it is not yet verified — no orphaned second challenge", async () => {
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: TOKEN, consume: true })
    expect(r).toMatchObject({ ok: false, challengeToken: TOKEN })
    expect(issueStepUpChallenge).not.toHaveBeenCalled()
  })

  it("names expiry in the refusal — the 5-minute window can outrun a cross-device ceremony", async () => {
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: TOKEN, consume: true })
    // Without this, registration-verify's 401 carries no message and the client falls back to
    // "Verification failed" — blaming the passkey for a step-up timeout.
    expect("error" in r && r.error).toMatch(/expired/i)
  })

  it("permits — and CONSUMES — on a verified token when consume is true (the mint)", async () => {
    stepUpTokenIsVerified.mockResolvedValue({ ok: true, challengeId: "c1" })
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: TOKEN, consume: true })
    expect(r).toEqual({ ok: true, bootstrap: false })
    expect(consumeStepUpChallenge).toHaveBeenCalledWith("c1")
  })

  it("permits WITHOUT consuming when consume is false (registration-options)", async () => {
    stepUpTokenIsVerified.mockResolvedValue({ ok: true, challengeId: "c1" })
    const r = await requirePasskeyEnrolAssurance({ userId: USER, providedToken: TOKEN, consume: false })
    expect(r).toEqual({ ok: true, bootstrap: false })
    expect(consumeStepUpChallenge).not.toHaveBeenCalled()
  })

  it("asks for the passkey_enroll action, which is what the DB CHECK constraint must carry", async () => {
    await requirePasskeyEnrolAssurance({ userId: USER, providedToken: TOKEN, consume: true })
    expect(stepUpTokenIsVerified).toHaveBeenCalledWith({ userId: USER, action: "passkey_enroll", providedToken: TOKEN })
  })
})

// A guard nothing calls is not a guard. Every assertion above is about this module in isolation, so
// deleting the call from either route leaves the whole suite green — and `check-invariant-has-callers`
// does not close it either: its regex is satisfied by this module's own literal. These two read the
// routes off disk so a silent un-wiring fails here instead of in production.
describe("both halves of the ceremony are wired to the guard", () => {
  const routes = {
    "registration-options": { file: "app/api/auth/passkeys/registration-options/route.ts", consume: false },
    "registration-verify": { file: "app/api/auth/passkeys/registration-verify/route.ts", consume: true },
  }

  for (const [name, { file, consume }] of Object.entries(routes)) {
    it(`${name} calls requirePasskeyEnrolAssurance with consume: ${consume}`, async () => {
      const { readFileSync } = await import("node:fs")
      const src = readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8")
      expect(src).toContain("requirePasskeyEnrolAssurance({")
      expect(src).toContain(`consume: ${consume},`)
    })
  }
})
