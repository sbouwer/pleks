/**
 * lib/comms/__tests__/template-registry.test.ts — registry-completeness guard
 *
 * Notes:  send-email.ts calls getTemplate(templateKey), which THROWS on an unknown key. Subscription
 *         comms (lib/subscriptions/emails.tsx) reference their keys as string literals, so a key present
 *         in emails.tsx but missing from TEMPLATE_REGISTRY ships green and only blows up at send time
 *         (this is exactly how "Unknown template key: subscription.resumed" reached prod). This test
 *         scans emails.tsx for every subscription.* templateKey and asserts each resolves.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getTemplate } from "../template-registry"

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
