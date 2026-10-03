/**
 * lib/applications/__tests__/commercial-emails.test.ts — the surety invite and reminder carry counsel's approved text, and nothing struck
 *
 * Notes:  Counsel live-text review 2026-10-03 (brief/legal/COUNSEL_APPROVED_SCREENING_COMMS_2026-10-03.md). The approved
 *         sentences are pinned here as literals ON PURPOSE: the builder holds the shipped copy, this file holds what
 *         counsel approved, and a drift in either one fails. brief/ is untracked, so the test cannot read the file itself.
 *         Probed both ways: each audience receives its OWN role sentence and none of the other three; no rendered email
 *         — any role, any reminder stage — contains a phrase counsel struck. KNOWN-GOOD: a planted struck phrase is
 *         caught by the same matcher the probe uses, so a matcher that matched nothing could not pass.
 */
import { describe, expect, it } from "vitest"
import { render } from "@react-email/components"
import { buildDirectorInviteElement, buildDirectorReminderElement, SURETY_ROLE_SENTENCES } from "@/lib/applications/commercial-emails"
import type { SuretyInviteRole } from "@/lib/applications/juristicParties"
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"

const APPROVED: Record<SuretyInviteRole, string> = {
  director: "You are listed as a director who may be signing a personal suretyship in connection with this lease.",
  generic: "You are listed as a person who may be signing a personal suretyship in connection with the lease for the business named in the application.",
  trustee: "You are listed as a trustee who may be signing a personal suretyship in connection with the lease for the trust named in the application.",
  member: "You are listed as a member of the close corporation who may be signing a personal suretyship in connection with its lease.",
}
const PROCEED = "Before the application can proceed, you need to complete your part — your consent and required document upload. Once all required people have completed their consent, the lead applicant will pay the screening fee."
const BULLET_3 = "Your screening results will be shared with the leasing agent. You will also receive a copy of your own screening report when complete."
const DECLINE = "If you do not wish to provide a personal suretyship for this lease, you can decline on the link page and we will let Lee Lead know to find a replacement."
const T10 = "After this, the application cannot proceed until the required consent is completed."

/** Struck by counsel (§1 bullet 1 and role/decline wording, §2 t10 + paidByPrimary). Matched case-insensitively. */
const FORBIDDEN: readonly RegExp[] = [/signing personal surety/i, /your (?:own )?portion[^.]*payment/i, /refunded/i, /already paid/i, /screening fee for your portion/i]

const ROLES = Object.keys(APPROVED) as SuretyInviteRole[]
const branding = { orgName: "Test Agency" }

/** Rendered to plain text, whitespace collapsed — what a reader sees, not how the JSX happens to split it. */
async function text(el: Parameters<typeof render>[0]): Promise<string> {
  return (await render(el, { plainText: true })).replace(/\s+/g, " ")
}

const invite = (role: SuretyInviteRole) => text(buildDirectorInviteElement({
  role, directorFirstName: "Sam", primaryContactName: "Lee Lead", propertyLabel: "Unit 1", propertyAddress: "1 Main Rd",
  portalUrl: "https://example.test/x", ttlDays: SCREENING_WINDOW_DAYS, branding,
}))
const reminder = (stage: "t3" | "t7" | "t10") => text(buildDirectorReminderElement({
  directorFirstName: "Sam", propertyLabel: "Unit 1", portalUrl: "https://example.test/x", daysRemaining: 4, stage, branding,
}))

describe("the surety invite — one builder, four approved role sentences (counsel §1)", () => {
  it("the shipped sentences are the approved sentences, verbatim", () => {
    expect(SURETY_ROLE_SENTENCES).toEqual(APPROVED)
  })

  it.each(ROLES)("the %s audience receives its own sentence and none of the other three", async (role) => {
    const body = await invite(role)
    expect(body).toContain(APPROVED[role])
    for (const other of ROLES.filter((r) => r !== role)) expect(body, other).not.toContain(APPROVED[other])
  })

  it.each(ROLES)("the %s invite carries the approved proceed, bullet-3 and decline sentences and the shared window", async (role) => {
    const body = await invite(role)
    for (const s of [PROCEED, BULLET_3, DECLINE, `This link expires in ${SCREENING_WINDOW_DAYS} days.`]) expect(body).toContain(s)
  })

  it.each(ROLES)("the %s invite contains no struck phrase", async (role) => {
    const body = await invite(role)
    for (const re of FORBIDDEN) expect(body, String(re)).not.toMatch(re)
  })
})

describe("the surety reminder — role-neutral, the refund and already-paid lines struck (counsel §2)", () => {
  it.each(["t3", "t7", "t10"] as const)("%s contains no struck phrase", async (stage) => {
    const body = await reminder(stage)
    for (const re of FORBIDDEN) expect(body, String(re)).not.toMatch(re)
  })

  it("t10 states the approved consequence instead", async () => {
    expect(await reminder("t10")).toContain(T10)
  })
})

describe("KNOWN-GOOD: the forbidden-phrase matcher fires on the text it guards against", () => {
  it.each([
    "You are listed as a director signing personal surety for this lease.",
    "you need to complete your own portion — payment, consent, and document upload.",
    "After this, the application will be cancelled and any fees paid will need to be refunded.",
    "Lee Lead has already paid for your portion.",
  ])("catches: %s", (planted) => {
    expect(FORBIDDEN.some((re) => re.test(planted))).toBe(true)
  })
})
