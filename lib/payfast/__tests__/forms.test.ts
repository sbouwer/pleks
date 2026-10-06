/**
 * lib/payfast/__tests__/forms.test.ts — the charged amount must come from the caller, never a literal
 *
 * Notes:  This is the regression guard for the defect that motivated the R250 reconciliation:
 *         buildApplicationFeeForm carried `amount: "399.00"` as a hardcoded literal and accepted no fee
 *         parameter, so app/api/billing/screening/route.ts computed the correct fee, wrote it to
 *         applications.fee_amount_cents, and then charged something else entirely. Nothing failed —
 *         there was no test on the amount at all, which is why it survived three months.
 *
 *         PROBE-FIRES: re-introduce a literal in buildApplicationFeeForm and "derives the amount from
 *         feeCents" goes red immediately. It asserts the ZAR string PayFast receives, not an internal.
 */
import { describe, it, expect } from "vitest"
import { buildApplicationFeeForm } from "@/lib/payfast/forms"

const BASE = {
  applicationId: "11111111-1111-1111-1111-111111111111",
  listingId:     "22222222-2222-2222-2222-222222222222",
  orgId:         "33333333-3333-3333-3333-333333333333",
  propertyName:  "Kirstenhof Court",
  unitName:      "201",
  token:         "inv-tok-abc",
}

describe("buildApplicationFeeForm charges what the caller asked for", () => {
  it("derives the amount from feeCents", () => {
    expect(buildApplicationFeeForm({ ...BASE, feeCents: 25000 }).data.amount).toBe("250.00")
    expect(buildApplicationFeeForm({ ...BASE, feeCents: 47000 }).data.amount).toBe("470.00")
    // An arbitrary value a literal could never coincidentally satisfy.
    expect(buildApplicationFeeForm({ ...BASE, feeCents: 31337 }).data.amount).toBe("313.37")
  })

  it("charges exactly feeCents for EVERY fee a quote can produce — R0.01 to R5 000, seeded", () => {
    // The fee is a quote over moving rates now (ADDENDUM_14V), so no fixed pair of constants can stand in for
    // it: the property is that the amount PayFast receives is the cents handed in, whatever they are.
    let seed = 147
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let i = 0; i < 500; i++) {
      const feeCents = 1 + Math.floor(rand() * 500000)
      expect(buildApplicationFeeForm({ ...BASE, feeCents }).data.amount, `feeCents=${feeCents}`).toBe((feeCents / 100).toFixed(2))
    }
  })

  it("formats as PayFast requires — 2dp, no thousands separator, no currency symbol", () => {
    const amount = buildApplicationFeeForm({ ...BASE, feeCents: 123456 }).data.amount
    expect(amount).toBe("1234.56")
    expect(amount).toMatch(/^\d+\.\d{2}$/)
  })

  it("signs the form AFTER the amount is set, so the signature covers the real figure", () => {
    // A signature generated over a stale amount would be rejected by PayFast. Two different amounts
    // must therefore produce two different signatures.
    const a = buildApplicationFeeForm({ ...BASE, feeCents: 25000 })
    const b = buildApplicationFeeForm({ ...BASE, feeCents: 47000 })
    expect(a.data.signature).toBeTruthy()
    expect(a.data.signature).not.toBe(b.data.signature)
  })

  it("carries the application, listing and org through as PayFast custom fields", () => {
    const { data } = buildApplicationFeeForm({ ...BASE, feeCents: 25000 })
    expect(data.custom_str1).toBe(BASE.applicationId)
    expect(data.custom_str2).toBe(BASE.listingId)
    expect(data.custom_str3).toBe(BASE.orgId)
  })
})

// A12: the payer returns to a page that can load their application. PLANTED: the old listing-id URL
// (/apply/<listingId>/status, no ?token) fails both the path and the "carries the token" assertions.
describe("buildApplicationFeeForm returns the payer to their own invite link", () => {
  it("return_url is the stage-2 tracker on the invite token; cancel_url is its payment page", () => {
    const { data } = buildApplicationFeeForm({ ...BASE, feeCents: 25000 })
    expect(new URL(data.return_url).pathname).toBe("/apply/invite/inv-tok-abc/status")
    expect(new URL(data.cancel_url).pathname).toBe("/apply/invite/inv-tok-abc/payment")
    for (const u of [data.return_url, data.cancel_url]) expect(u).not.toContain(BASE.listingId)
  })

  it("the token is path-encoded, so it cannot break out of its segment", () => {
    const { data } = buildApplicationFeeForm({ ...BASE, token: "a/b?c", feeCents: 25000 })
    expect(new URL(data.return_url).pathname).toBe("/apply/invite/a%2Fb%3Fc/status")
  })
})
