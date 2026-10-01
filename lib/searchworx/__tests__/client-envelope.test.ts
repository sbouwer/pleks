/**
 * lib/searchworx/__tests__/client-envelope.test.ts — searchworxCall carries envelope metadata on BOTH branches
 *
 * Notes:  The pure extractor has its own test; this pins the WIRING. `envelope` is optional on the
 *         failure type (a transport error throws before any envelope exists), so deleting it from the
 *         failure branch would still typecheck — and a "not found" is billed at the standard rate, so
 *         the failure envelope is the one most worth keeping (walk F2, 2026-10-01).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const TOKEN = "11111111-2222-3333-4444-555555555555"

function stubVendor(productBody: unknown) {
  const fetchMock = vi.fn(async (url: string) => {
    const body = url.endsWith("/auth/login/") ? { ResponseMessage: TOKEN } : productBody
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("searchworxCall envelope wiring", () => {
  beforeEach(() => {
    vi.stubEnv("SEARCHWORX_USERNAME", "probe")
    vi.stubEnv("SEARCHWORX_PASSWORD", "probe")
    vi.stubEnv("SEARCHWORX_BASE_URL", "https://vendor.invalid")
    vi.resetModules()  // the token cache is module state; a fresh module per case starts it empty
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("a success carries the envelope metadata", async () => {
    stubVendor({
      ResponseMessage: "VCCBIncomeEstimator",
      ChargedAmount: 7.15,
      ResponseObject: { SearchInformation: { SearchID: 9 }, PersonInformation: { FirstName: "Test" } },
    })
    const { searchworxCall } = await import("../client")
    const r = await searchworxCall({ productPath: "probe/product", buildBody: (t) => ({ SessionToken: t }) })
    expect(r.ok).toBe(true)
    expect(r.envelope?.top.ChargedAmount).toBe(7.15)
    expect(r.envelope?.responseObjectKeys).toEqual(["SearchInformation", "PersonInformation"])
  })

  it("a vendor-reported failure carries it too", async () => {
    stubVendor({ ResponseMessage: "No record found", ChargedAmount: 7.15, ResponseObject: { SearchInformation: { SearchID: 10 } } })
    const { searchworxCall } = await import("../client")
    const r = await searchworxCall({ productPath: "probe/product", buildBody: (t) => ({ SessionToken: t }) })
    expect(r.ok).toBe(false)
    expect(r.envelope?.top.ChargedAmount).toBe(7.15)
    expect(r.envelope?.searchInformation).toEqual({ SearchID: 10 })
  })
})
