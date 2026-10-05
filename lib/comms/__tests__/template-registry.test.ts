/**
 * lib/comms/__tests__/template-registry.test.ts — registry-completeness guard
 *
 * Notes:  send-email.ts calls getTemplate(templateKey), which THROWS on an unknown key. Subscription
 *         comms (lib/subscriptions/emails.tsx) reference their keys as string literals, so a key present
 *         in emails.tsx but missing from TEMPLATE_REGISTRY ships green and only blows up at send time
 *         (this is exactly how "Unknown template key: subscription.resumed" reached prod). This test
 *         scans emails.tsx for every subscription.* templateKey and asserts each resolves.
 *         The same guard over application.* (ADDENDUM_14X P4, grounder G9): every `templateKey: "application.…"` and
 *         every `…_KEY = "application.…"` literal in lib/ and app/ resolves, and the 14X trail reads each one's
 *         version, so an unregistered key would throw at the first cron send. A held key (`heldFor`) still resolves —
 *         it is registered, only refused by sendEmail — and the refusal is pinned here too.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { getTemplate, heldFor } from "../template-registry"

const emailsSrc = readFileSync(join(process.cwd(), "lib/subscriptions/emails.tsx"), "utf8")
const referencedKeys = [
  ...new Set([...emailsSrc.matchAll(/templateKey:\s*"(subscription\.[a-z0-9_]+)"/g)].map((m) => m[1])),
]

describe("subscription email template keys are all in TEMPLATE_REGISTRY", () => {
  it("found the subscription template keys in emails.tsx", () => {
    expect(referencedKeys.length).toBeGreaterThan(5)
  })

  it.each(referencedKeys)("getTemplate(%s) does not throw", (key) => {
    expect(() => getTemplate(key)).not.toThrow()
  })

  // The registry exists BECAUSE it throws on an unknown key (that's how "Unknown template key:
  // subscription.resumed" surfaced at all). Pin the throw, so a refactor that returns undefined instead — which
  // would make the missing-key guard above silently useless — fails here.
  it("throws on an unknown key (the guard's whole reason for existing)", () => {
    expect(() => getTemplate("subscription.totally_made_up_key")).toThrow(/unknown template key/i)
    expect(() => getTemplate("")).toThrow()
  })
})

/** Every non-test .ts/.tsx file under a root. */
function sources(root: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(root)) {
    const p = join(root, name)
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") out.push(...sources(p))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const applicationKeys = [...new Set(
  ["lib", "app"].flatMap((r) => sources(join(process.cwd(), r))).flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/(?:templateKey:\s*|_KEY = )"(application\.[a-z0-9_]+)"/g)].map((m) => m[1])),
)]

describe("application email template keys are all in TEMPLATE_REGISTRY (14X P4, G9)", () => {
  it("found the application template keys across lib/ and app/", () => {
    expect(applicationKeys.length).toBeGreaterThan(15)
    expect(applicationKeys).toContain("application.screening_final_notice")
  })

  it.each(applicationKeys)("getTemplate(%s) does not throw", (key) => {
    expect(() => getTemplate(key)).not.toThrow()
  })
})

describe("a held template is registered but never sent", () => {
  it("the 14X new-copy keys are held; the approved invite is not", () => {
    expect(heldFor("application.screening_final_notice")).toMatch(/COUNSEL_DRAFT_14X/)
    expect(heldFor("application.co_applicant_invited")).toBeNull()
  })

  it("sendEmail refuses a held key before anything else runs — no preference read, no provider, no log row", async () => {
    const { sendEmail } = await import("../send-email")
    const out = await sendEmail({
      orgId: "org-A", templateKey: "application.screening_final_notice", to: { email: "x@example.test", name: "X" },
      subject: "s", contentHtml: "<p>h</p>",
    })
    expect(out).toEqual({ success: false, error: expect.stringMatching(/^Held: COUNSEL_DRAFT_14X/) })
  })
})
