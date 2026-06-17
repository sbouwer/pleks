import { describe, it, expect, vi } from "vitest"
import {
  generatePortalInviteLink,
  isEmailAlreadyRegistered,
  type GenerateLinkFn,
  type GenerateLinkResult,
} from "../portalInviteLink"

const ok = (link: string): GenerateLinkResult => ({ data: { properties: { action_link: link } }, error: null })
const err = (e: { message: string; code?: string }): GenerateLinkResult => ({ data: null, error: e })

const OPTS = { email: "t@example.com", data: { role: "tenant" }, redirectTo: "https://app/tenant" }

describe("isEmailAlreadyRegistered", () => {
  it("detects the already-registered signals (code + message variants)", () => {
    expect(isEmailAlreadyRegistered({ message: "", code: "email_exists" })).toBe(true)
    expect(isEmailAlreadyRegistered({ message: "A user with this email address has already been registered" })).toBe(true)
    expect(isEmailAlreadyRegistered({ message: "Email already exists" })).toBe(true)
  })
  it("is false for null + unrelated errors", () => {
    expect(isEmailAlreadyRegistered(null)).toBe(false)
    expect(isEmailAlreadyRegistered({ message: "rate limit exceeded" })).toBe(false)
  })
})

describe("generatePortalInviteLink", () => {
  it("net-new tenant → invite succeeds, mode 'invite', no fallback", async () => {
    const generate = vi.fn<GenerateLinkFn>().mockResolvedValueOnce(ok("https://invite-link"))
    const r = await generatePortalInviteLink(generate, OPTS)
    expect(r).toEqual({ actionLink: "https://invite-link", mode: "invite" })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0].type).toBe("invite")
  })

  it("REGRESSION (the latent bug): invite on an already-registered email falls back to a magic-link instead of failing", async () => {
    const generate = vi.fn<GenerateLinkFn>()
      .mockResolvedValueOnce(err({ message: "A user with this email address has already been registered", code: "email_exists" }))
      .mockResolvedValueOnce(ok("https://magic-link"))
    const r = await generatePortalInviteLink(generate, OPTS)
    // Before the fix this whole step recorded `failed` with no hand-off; now it upgrades via magic-link.
    expect(r).toEqual({ actionLink: "https://magic-link", mode: "magiclink" })
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[1][0].type).toBe("magiclink")
  })

  it("surfaces a non-registration invite error without a pointless magic-link attempt", async () => {
    const generate = vi.fn<GenerateLinkFn>().mockResolvedValueOnce(err({ message: "rate limit exceeded" }))
    const r = await generatePortalInviteLink(generate, OPTS)
    expect(r).toEqual({ error: "rate limit exceeded" })
    expect(generate).toHaveBeenCalledTimes(1)   // no fallback on an unrelated error
  })

  it("surfaces the magic-link error if the fallback itself fails", async () => {
    const generate = vi.fn<GenerateLinkFn>()
      .mockResolvedValueOnce(err({ code: "email_exists", message: "already registered" }))
      .mockResolvedValueOnce(err({ message: "magiclink boom" }))
    const r = await generatePortalInviteLink(generate, OPTS)
    expect(r).toEqual({ error: "magiclink boom" })
  })
})
