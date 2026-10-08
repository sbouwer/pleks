/**
 * lib/observability/__tests__/scrubbing.test.ts — scrubString PII/secret redaction
 *
 * Notes: guards the ADDENDUM_68 bug-report scrub contract. The pleks_trace 32-hex
 *        correlation id MUST survive (it's the log join key) while \x-hex blobs and
 *        tokens are masked.
 */
import { describe, it, expect } from "vitest"
import type { ErrorEvent, Event } from "@sentry/nextjs"
import { scrubString, scrubObject, scrubUrl, scrubEvent, scrubTransaction } from "@/lib/observability/scrubbing"

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

describe("scrubUrl — link tokens never leave in a URL", () => {
  const hex = "a".repeat(32) + "0123456789abcdef0123456789abcdef"
  const uuid = "126581d5-7b64-4508-93bd-ff4f4e4a897a"

  it("drops the query string and fragment", () => {
    expect(scrubUrl(`https://app.pleks.co.za/wo/abc?token=${uuid}#x`)).toBe("https://app.pleks.co.za/wo/abc")
  })

  it("masks a UUID or 64-hex token held as a path segment", () => {
    expect(scrubUrl(`https://app.pleks.co.za/approve/${uuid}`)).toBe("https://app.pleks.co.za/approve/:id")
    expect(scrubUrl(`/apply/invite/${hex}`)).toBe("/apply/invite/:id")
  })

  it("keeps route words, including long hyphenated ones", () => {
    expect(scrubUrl("/api/cron/screening-portal-reminders")).toBe("/api/cron/screening-portal-reminders")
    expect(scrubUrl("GET /apply/[slug]/director-portal/[token]")).toBe("GET /apply/[slug]/director-portal/[token]")
  })
})

describe("scrubString — token-shaped text", () => {
  it("masks a 64-hex token and a credential-named query param, keeps the 32-hex trace", () => {
    const hex = "0123456789abcdef".repeat(4)
    expect(scrubString(`token ${hex}`)).toBe("token [token]")
    expect(scrubString("GET /wo/x?token=abc-123&page=2")).toBe("GET /wo/x?token=[token]&page=2")
    expect(scrubString("trace 6fb80a6907b3358614320cf8d8a29596")).toContain("6fb80a6907b3358614320cf8d8a29596")
  })
})

describe("scrubEvent / scrubTransaction", () => {
  const uuid = "126581d5-7b64-4508-93bd-ff4f4e4a897a"

  it("scrubs the request URL and drops its query string", () => {
    const out = scrubEvent({
      type: undefined,
      request: { url: `https://app.pleks.co.za/approve/${uuid}?token=x`, query_string: "token=x", headers: { a: "b" } },
    } as ErrorEvent)!
    expect(out.request?.url).toBe("https://app.pleks.co.za/approve/:id")
    expect(out.request?.query_string).toBeUndefined()
    expect(out.request?.headers).toBeUndefined()
  })

  it("scrubs navigation and fetch breadcrumbs", () => {
    const out = scrubEvent({
      type: undefined,
      breadcrumbs: [
        { category: "navigation", data: { from: `/wo/${uuid}`, to: "/x?token=y" } },
        { category: "fetch", data: { url: `https://app.pleks.co.za/api/approve/${uuid}`, status_code: 200 } },
      ],
    } as ErrorEvent)!
    expect(out.breadcrumbs?.[0].data).toEqual({ from: "/wo/:id", to: "/x" })
    expect(out.breadcrumbs?.[1].data).toEqual({ url: "https://app.pleks.co.za/api/approve/:id", status_code: 200 })
  })

  it("scrubs a transaction's name, spans and request — beforeSend never sees one", () => {
    const out = scrubTransaction({
      type: "transaction",
      transaction: `/sign-signature/${uuid}`,
      request: { url: `https://app.pleks.co.za/sign-signature/${uuid}` },
      spans: [{
        span_id: "s", trace_id: "t", start_timestamp: 0, origin: "manual",
        description: `GET https://app.pleks.co.za/api/applications/invite-status/${uuid}?x=1`,
        data: { "http.url": `https://app.pleks.co.za/wo/abc?token=${uuid}`, "url.query": `token=${uuid}` },
      }],
    } as Event & { type: "transaction" })!
    expect(JSON.stringify(out)).not.toContain(uuid)
    expect(out.transaction).toBe("/sign-signature/:id")
    expect(out.spans?.[0].data).toEqual({ "http.url": "https://app.pleks.co.za/wo/abc" })
  })
})

describe("walker sentry-scrub F1–F7 — every token shape, every field", () => {
  const uuid = "126581d5-7b64-4508-93bd-ff4f4e4a897a"
  const resultTok = "eyJ2IjoxLCJwIjoicmVzdWx0In0.dGhpc2lzYW5obWFjc2lnbmF0dXJlMTIz"
  const noticeTok = "AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQ" // 43 chars, digit-free
  const hex48 = "abcdef0123456789".repeat(3)

  it("F1/F2: the root span's attributes and Next's request path are scrubbed in contexts", () => {
    const out = scrubTransaction({
      type: "transaction",
      contexts: {
        trace: { trace_id: "6fb80a6907b3358614320cf8d8a29596", span_id: "abcdef0123456789",
          data: { "http.target": `/approve/${uuid}?token=${uuid}`, "url.full": `https://app.pleks.co.za/approve/${uuid}`, "url.query": `token=${uuid}` } },
        nextjs: { request_path: `/sign-signature/${uuid}` },
      },
    } as Event & { type: "transaction" })!
    expect(JSON.stringify(out)).not.toContain(uuid)
    expect(out.contexts?.trace?.trace_id).toBe("6fb80a6907b3358614320cf8d8a29596")
    expect(out.contexts?.trace?.data).toEqual({ "http.target": "/approve/:id", "url.full": "https://app.pleks.co.za/approve/:id" })
  })

  it("F3/F6: a dotted result token and a digit-free base64url token are masked as segments", () => {
    expect(scrubUrl(`/apply/result/${resultTok}`)).toBe("/apply/result/:id")
    expect(scrubUrl(`/public/notice/${noticeTok}`)).toBe("/public/notice/:id")
  })

  it("F4: nested breadcrumb data is still scrubbed", () => {
    const out = scrubEvent({ type: undefined, breadcrumbs: [{ data: { nested: { who: "a@b.co.za", id: "8001015009087" } } }] } as ErrorEvent)!
    expect(out.breadcrumbs?.[0].data).toEqual({ nested: { who: "[email]", id: "[id-number]" } })
  })

  it("F5: a relative token path in prose, tags and extra is masked; a bare uuid in prose is kept", () => {
    const out = scrubEvent({
      type: undefined,
      exception: { values: [{ value: `fetch failed for /approve/${uuid}.` }] },
      tags: { path: `/wo/${uuid}` },
      extra: { note: `unsub /unsubscribe/${hex48}` },
    } as ErrorEvent)!
    expect(out.exception?.values?.[0].value).toBe("fetch failed for /approve/:id.")
    expect(out.tags).toEqual({ path: "/wo/:id" })
    expect(out.extra).toEqual({ note: "unsub /unsubscribe/:id" })
    expect(scrubString(`user ${uuid}`)).toContain(uuid)
  })

  it("F7: a 48/64-hex token glued to a word is masked", () => {
    expect(scrubString(`tok_${hex48}`)).toBe("tok_[token]")
  })
})
