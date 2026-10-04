/**
 * lib/screening/__tests__/refundOwed.test.ts — the owed refund's share of a line's own fee (ADDENDUM_14W §0c)
 *
 * Data:   none — pure; the write path runs against a real database in test/db/residential-screening-e2e.dbtest.ts
 */
import { describe, it, expect, vi } from "vitest"

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))

import { refundShareCents } from "@/lib/screening/refundOwed"

const C = "combined_consumer_credit_report"
const V = "vccb_income_estimator"
const PRICED = [C, V]
const rates: Record<string, number> = { [C]: 19410, [V]: 715 }
const rateOf = (k: string) => rates[k]

describe("refundShareCents", () => {
  it("nothing terminal → nothing owed", () => {
    expect(refundShareCents(30000, PRICED, [], [C, V], rateOf)).toBeNull()
  })

  it("every priced product terminal → the whole fee", () => {
    expect(refundShareCents(30000, PRICED, [C, V], [], rateOf)).toBe(30000)
  })

  it("one product terminal, the other completed → its rate share, rounded UP", () => {
    const share = refundShareCents(30000, PRICED, [C], [V], rateOf)
    expect(share).toBe(Math.ceil((30000 * 19410) / (19410 + 715)))
    expect(share).toBeLessThan(30000)
  })

  it("nothing completed → the whole fee: a foreign national (VCCB skipped) whose Combined is terminal received nothing", () => {
    expect(refundShareCents(30000, PRICED, [C], [], rateOf)).toBe(30000)
  })

  it("a missing rate → null, never a guess", () => {
    expect(refundShareCents(30000, PRICED, [C], [V], (k) => (k === V ? undefined : rates[k]))).toBeNull()
  })

  it("a terminal product outside the priced set (a company line) with something completed → null, for a person", () => {
    expect(refundShareCents(30000, ["compuscan_company_profile", "cipc_company"], [C], [V], () => 100)).toBeNull()
  })

  it("never above the fee", () => {
    expect(refundShareCents(1, PRICED, [C], [V], rateOf)).toBe(1)
  })
})
