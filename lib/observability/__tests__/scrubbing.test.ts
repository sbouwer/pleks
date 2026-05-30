/**
 * lib/observability/__tests__/scrubbing.test.ts — scrubString PII/secret redaction
 *
 * Notes: guards the ADDENDUM_68 bug-report scrub contract. The pleks_trace 32-hex
 *        correlation id MUST survive (it's the log join key) while \x-hex blobs and
 *        tokens are masked.
 */
import { describe, it, expect } from "vitest"
import { scrubString, scrubObject } from "@/lib/observability/scrubbing"

describe("scrubString", () => {
  it("masks email, SA ID, SA phone, card", () => {
    expect(scrubString("reach me at jane.doe@example.co.za")).toContain("[email]")
    expect(scrubString("id 8001015009087 on file")).toContain("[id-number]")
    expect(scrubString("call 0821234567 now")).toContain("[phone]")
    expect(scrubString("card 4111 1111 1111 1111")).toContain("[card]")
  })

  it("masks JWTs and bearer tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    expect(scrubString(`token=${jwt}`)).not.toContain(jwt)
    expect(scrubString(`token=${jwt}`)).toContain("[token]")
    expect(scrubString("Authorization: Bearer abc.def-123_XYZ")).toContain("Bearer [token]")
  })

  it("masks bytea \\x-hex blobs", () => {
    expect(scrubString("challenge \\x8dff264d5f436e on row")).toContain("[hex]")
  })

  it("PRESERVES the 32-char pleks_trace id (it is the log join key)", () => {
    const trace = "6fb80a6907b3358614320cf8d8a29596"
    expect(scrubString(`trace ${trace}`)).toContain(trace)
  })

  it("PRESERVES uuids (non-identifying)", () => {
    const uuid = "126581d5-7b64-4508-93bd-ff4f4e4a897a"
    expect(scrubString(`user ${uuid}`)).toContain(uuid)
  })

  it("is a no-op on clean text", () => {
    expect(scrubString("I tapped Pay and nothing happened")).toBe("I tapped Pay and nothing happened")
  })
})

describe("scrubObject", () => {
  it("recurses into nested strings, leaves non-strings alone", () => {
    const out = scrubObject({
      message: "email me at a@b.co.za",
      count: 3,
      nested: { stack: "at fn (Bearer xyz123abc)" },
    })
    expect(out.message).toContain("[email]")
    expect(out.count).toBe(3)
    expect((out.nested as { stack: string }).stack).toContain("Bearer [token]")
  })
})
