/**
 * app/(admin)/admin/platform-health/__tests__/sentryClientProbe.test.ts — the probe's fake PII is exactly what the scrubber rewrites
 *
 * Notes:  The prod probe proves scrubbing only if every planted value is a shape scrubString redacts. Planted: the raw
 *         message carries all three values. Known-good: after scrubString none survives and each placeholder appears,
 *         with the nonce kept so the issue can still be found.
 */
import { describe, expect, it } from "vitest"
import { scrubString } from "@/lib/observability/scrubbing"
import { probeMessage } from "../SentryClientProbe"

describe("SentryClientProbe message", () => {
  const raw = probeMessage("scp-abc123")

  it("PLANTED: the raw message carries each synthetic value", () => {
    for (const v of ["probe.person@example.com", "8001015009087", "0821234567"]) expect(raw).toContain(v)
  })

  it("scrubbed, no value survives, each placeholder appears, and the nonce is kept", () => {
    const s = scrubString(raw)
    for (const v of ["probe.person@example.com", "8001015009087", "0821234567"]) expect(s).not.toContain(v)
    for (const p of ["[email]", "[id-number]", "[phone]"]) expect(s).toContain(p)
    expect(s).toContain("scp-abc123")
  })
})
