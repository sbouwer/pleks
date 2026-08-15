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
import { APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"

const BASE = {
  applicationId: "11111111-1111-1111-1111-111111111111",
  listingId:     "22222222-2222-2222-2222-222222222222",
  orgId:         "33333333-3333-3333-3333-333333333333",
  propertyName:  "Kirstenhof Court",
  unitName:      "201",
}

describe("buildApplicationFeeForm charges what the caller asked for", () => {
  it("derives the amount from feeCents", () => {
    expect(buildApplicationFeeForm({ ...BASE, feeCents: 25000 }).data.amount).toBe("250.00")
    expect(buildApplicationFeeForm({ ...BASE, feeCents: 47000 }).data.amount).toBe("470.00")
    // An arbitrary value a literal could never coincidentally satisfy.
    expect(buildApplicationFeeForm({ ...BASE, feeCents: 31337 }).data.amount).toBe("313.37")
  })

  it("never emits the superseded R399 unless that is what it was handed", () => {
    expect(buildApplicationFeeForm({ ...BASE, feeCents: APPLICATION_FEE_CENTS }).data.amount).not.toBe("399.00")
    expect(buildApplicationFeeForm({ ...BASE, feeCents: JOINT_APPLICATION_FEE_CENTS }).data.amount).not.toBe("749.00")
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
