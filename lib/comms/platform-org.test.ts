/**
 * lib/comms/platform-org.test.ts — invariants around the Pleks system org
 *
 * Notes:  Both assertions guard silent regressions. A security notice that loses is_mandatory becomes
 *         suppressible by an unsubscribe — a security failure that looks like a preference. And the
 *         platform from-address must never collide with the "via Pleks" agency suffix.
 */
import { describe, it, expect } from "vitest"
import { PLATFORM_ORG_ID, preformatted } from "./platform-org"
import { getTemplate } from "./template-registry"

describe("platform org", () => {
  it("uses a fixed UUID that is not one of the reserved sentinels", () => {
    // ...0001 is the ADDENDUM_57G purge tombstone (a trigger guards it); ...0000/...0003 are reserved.
    expect(PLATFORM_ORG_ID).toBe("00000000-0000-0000-0000-000000000002")
    expect(["00000000-0000-0000-0000-000000000000",
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000003"]).not.toContain(PLATFORM_ORG_ID)
  })

  // canSend bypasses mandatory templates. If either of these loses is_mandatory, a user who
  // unsubscribes stops receiving "your account was accessed from a new device".
  it.each(["security.login_notification", "security.account_alert"])(
    "%s is mandatory — canSend can never suppress a security alert",
    (key) => {
      expect(getTemplate(key).is_mandatory).toBe(true)
    },
  )

  it("ops digests are NOT mandatory (they are internal, and suppressible without harm)", () => {
    expect(getTemplate("ops.cron_digest").is_mandatory).toBe(false)
    expect(getTemplate("ops.link_check").is_mandatory).toBe(false)
  })
})

describe("preformatted", () => {
  it("escapes before wrapping — a broken link's URL carries & and can carry <", () => {
    const html = preformatted("https://x.test/a?b=1&c=2 <script>alert(1)</script>")
    expect(html).toContain("&amp;")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
  })

  it("preserves the column alignment ops reports depend on", () => {
    expect(preformatted("a\n  b")).toContain("<pre")
    expect(preformatted("a\n  b")).toContain("a\n  b")
  })
})
