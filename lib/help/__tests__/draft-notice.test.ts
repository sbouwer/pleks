/**
 * lib/help/__tests__/draft-notice.test.ts — M-077: the draft gate must actually gate
 *
 * Auth:   none — unit test
 * Data:   lib/help/draft-notice.ts, with help-data mocked to reach the signed-off branch
 * Notes:  Probed BOTH directions. The failure direction alone would pass against a function that
 *         returns a notice unconditionally — which is exactly the defect M-077 records, one layer
 *         up: a constant that always says "draft" and nothing that ever reads it is
 *         indistinguishable from a gate, until you check the other branch.
 */
import { describe, it, expect, vi, afterEach } from "vitest"

afterEach(() => {
  vi.resetModules()
  vi.doUnmock("../help-data")
})

describe("helpDraftNotice (M-077)", () => {
  it("returns a notice while HELP_CONTENT_DRAFT is true — the current, unsigned state", async () => {
    vi.doMock("../help-data", () => ({ HELP_CONTENT_DRAFT: true }))
    const { helpDraftNotice } = await import("../draft-notice")
    const notice = helpDraftNotice()

    expect(notice).not.toBeNull()
    expect(notice?.title).toBeTruthy()
    expect(notice?.body).toBeTruthy()
  })

  it("KNOWN-GOOD: returns null once the flag is flipped false — the gate must have an off state", async () => {
    vi.doMock("../help-data", () => ({ HELP_CONTENT_DRAFT: false }))
    const { helpDraftNotice } = await import("../draft-notice")

    expect(helpDraftNotice()).toBeNull()
  })

  it("the notice warns against acting on unverified answers, not merely that content is 'draft'", async () => {
    vi.doMock("../help-data", () => ({ HELP_CONTENT_DRAFT: true }))
    const { helpDraftNotice } = await import("../draft-notice")
    const body = helpDraftNotice()?.body.toLowerCase() ?? ""

    // The point of the disclosure is the ACTION a reader might take on a wrong answer — deposits and
    // notice periods are statutory and money is unrecoverable. A banner that only says "draft" tells
    // a tenant nothing about why it matters to them.
    expect(body).toContain("confirm with the team")
    expect(body).toMatch(/deposit|notice period|money/)
  })

  it("reads the REAL constant, not only the mock — the flag is still true in the tree today", async () => {
    // Guards the mock from becoming the only thing under test: if someone flips HELP_CONTENT_DRAFT
    // to false without doing the §7 pass, this fails and M-077 gets re-read rather than silently
    // closing. Delete this case in the same commit that legitimately signs the content off.
    const { HELP_CONTENT_DRAFT } = await import("../help-data")
    expect(HELP_CONTENT_DRAFT).toBe(true)
  })
})
