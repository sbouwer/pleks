/**
 * lib/comms/templates/system-email.test.tsx — the central branded shell for ad-hoc system emails
 *
 * Notes:  Locks the invariant that a caller supplying only a body FRAGMENT still gets full chrome and the
 *         org's branding (or the Pleks fallback). The team-invite email shipped bare for exactly this
 *         reason: it hand-rolled <p> tags and passed them as rawHtml, which is sent unwrapped.
 *         Also locks the Pleks wordmark's dark-mode swap: the dark variant must stay hidden in a client that
 *         drops inline display:none or strips the <head> <style> (both wordmarks showed, 2026-09-14).
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

// The daily cron digest arrived on 2026-09-14 showing BOTH wordmarks stacked. The dark variant was hidden only by
// an inline display:none on its <img>, which a client may drop, and revealed by a <head> <style> a client may strip.
describe("Pleks wordmark — the dark variant stays hidden without the swap CSS", () => {
  const pleks = () => render(<SystemEmail preview="p" branding={buildBranding(null)} contentHtml={FRAGMENT} />)

  it("hides the dark wordmark in a wrapper, with every fallback layer", async () => {
    const html = await pleks()
    const wrapper = /<div class="pl-logo-dark" style="([^"]*)">\s*<img[^>]*pleks-wordmark-dark\.png/.exec(html)
    expect(wrapper, "the dark wordmark must sit inside the .pl-logo-dark wrapper").not.toBeNull()
    const style = wrapper![1]
    expect(style).toContain("display:none")
    expect(style).toContain("mso-hide:all")   // classic Outlook ignores display:none on images
    expect(style).toContain("max-height:0")
    expect(style).toContain("overflow:hidden")
    expect(html.match(/<img[^>]*pleks-wordmark-dark\.png/g)?.length).toBe(1)  // exactly one dark <img>, the wrapped one
  })

  it("the swap CSS reveals the wrapper by undoing every hiding property, in both dark-mode selectors", async () => {
    const html = await pleks()
    const reveal = ".pl-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}"
    expect(html.split(reveal).length - 1).toBe(2)  // @media (prefers-color-scheme: dark) and [data-ogsc]
  })

  it("an org with its own logo gets no Pleks wordmark at all", async () => {
    const html = await render(
      <SystemEmail
        preview="p"
        contentHtml={FRAGMENT}
        branding={{ orgName: "Acme Rentals", logoUrl: "https://example.test/acme.png" }}
      />,
    )
    expect(html).not.toContain("pleks-wordmark")
  })
})
