/**
 * peerEmails.test.ts — per-recipient link builders (ADDENDUM_14R Phase 4). The invariant: each recipient's link
 * carries THEIR OWN credential — a co's link uses the co's access token, the lead's uses the lead token.
 */
import { describe, it, expect } from "vitest"
import { applyLink, reviewLink, type PeerRecipient } from "./peerEmails"

const lead: PeerRecipient = { email: "lead@x.com", name: "Lead One", kind: "lead" }
const co: PeerRecipient = { email: "co@x.com", name: "Co Two", kind: "co", coToken: "co-tok" }

describe("applyLink", () => {
  it("a co gets their OWN co-applicant invite link (their token, not the lead's)", () => {
    const url = applyLink(co, "the-slug", "app-1", "lead-tok")
    expect(url).toContain("/apply/co-applicant/co-tok")
    expect(url).not.toContain("lead-tok")
  })
  it("the lead gets the resume link with the lead token", () => {
    expect(applyLink(lead, "the-slug", "app-1", "lead-tok")).toContain("/apply/the-slug?app=app-1&token=lead-tok")
  })
  it("falls back to the bare apply link when the lead has no token", () => {
    expect(applyLink(lead, "the-slug", "app-1", null)).toMatch(/\/apply\/the-slug$/)
  })
})

describe("reviewLink", () => {
  it("each peer's view-only link uses their own credential", () => {
    expect(reviewLink(co, "lead-tok")).toContain("/apply/review/co-tok")
    expect(reviewLink(lead, "lead-tok")).toContain("/apply/review/lead-tok")
  })
})
