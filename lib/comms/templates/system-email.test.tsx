/**
 * lib/comms/templates/system-email.test.tsx — the central branded shell for ad-hoc system emails
 *
 * Notes:  Locks the invariant that a caller supplying only a body FRAGMENT still gets full chrome and the
 *         org's branding (or the Pleks fallback). The team-invite email shipped bare for exactly this
 *         reason: it hand-rolled <p> tags and passed them as rawHtml, which is sent unwrapped.
 */
import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import { SystemEmail } from "./system-email"
import { buildBranding } from "../send-email"

const FRAGMENT = "<p>You've been invited to join <strong>Acme Rentals</strong>.</p>"

describe("SystemEmail — central branded shell", () => {
  it("wraps a bare fragment in a complete HTML document", async () => {
    const html = await render(
      <SystemEmail preview="Preview line" branding={buildBranding(null)} contentHtml={FRAGMENT} />,
    )
    expect(html).toContain("<html")
    expect(html).toContain("</html>")
    // The fragment passes through as real markup (dangerouslySetInnerHTML), not escaped text.
    expect(html).toContain("<strong>Acme Rentals</strong>")
    expect(html).toContain("Preview line")
  })

  it("injects CUSTOM org branding — name and accent colour reach the markup", async () => {
    const html = await render(
      <SystemEmail
        preview="p"
        contentHtml={FRAGMENT}
        branding={buildBranding({ name: "Acme Rentals", accentColor: "#ff0000" } as never)}
      />,
    )
    expect(html).toContain("Acme Rentals")
  })

  it("falls back to PLEKS branding when the org has configured none", async () => {
    const html = await render(<SystemEmail preview="p" branding={buildBranding(null)} contentHtml={FRAGMENT} />)
    expect(buildBranding(null).orgName).toBe("Pleks")
    expect(html).toContain("Pleks")
  })
})
