/**
 * lib/screening/__tests__/visaLeaseCheck.test.ts — a missing input must not read as an all-clear.
 *
 * This check was vacuous in the field: its only caller passes `null` for the proposed lease end, so
 * the null guard was the only branch that ever ran and every foreign-national applicant got a
 * constant `compatible: true`. The agent saw a screen that had visibly run a visa/lease check and
 * raised nothing, then signed a 12-month lease against a permit lapsing in month four.
 *
 * The first two fixtures are the ones that matter — they are the states that could NOT be reached
 * before, and a suite without them would have been green throughout.
 */
import { describe, it, expect } from "vitest"
import { checkVisaLeaseAlignment } from "@/lib/screening/visaLeaseCheck"

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000)

describe("checkVisaLeaseAlignment", () => {
  it("reports NOT ASSESSED when there is no proposed lease end — the field case", () => {
    const r = checkVisaLeaseAlignment(inDays(120), null)
    expect(r.assessed).toBe(false)
    // `compatible` stays true so nothing downstream inverts, but it carries no information and
    // `assessed` is what a surface must key on.
    expect(r.warning).toBeNull()
  })

  it("reports NOT ASSESSED when there is no permit expiry", () => {
    expect(checkVisaLeaseAlignment(null, inDays(300)).assessed).toBe(false)
  })

  it("warns when the lease runs past the permit — a state previously unreachable", () => {
    const r = checkVisaLeaseAlignment(d("2027-03-01"), d("2027-09-01"))
    expect(r.assessed).toBe(true)
    expect(r.compatible).toBe(false)
    expect(r.warning).toContain("extends past permit expiry")
    expect(r.recommendation).toContain("break clause")
    // The suggested end is a month before expiry, not the expiry itself.
    expect(r.recommendation).toContain("30 Jan 2027")
  })

  it("nudges for renewal when the permit expires within six months — also previously unreachable", () => {
    const r = checkVisaLeaseAlignment(inDays(100), inDays(90))
    expect(r.assessed).toBe(true)
    expect(r.compatible).toBe(true)
    expect(r.warning).toBeNull()
    expect(r.recommendation).toContain("Confirm permit renewal")
  })

  it("stays quiet when the lease ends well inside a permit with more than six months to run", () => {
    const r = checkVisaLeaseAlignment(inDays(400), inDays(300))
    expect(r).toEqual({ assessed: true, compatible: true, warning: null, recommendation: null })
  })

  it("treats a lease ending exactly ON the permit expiry as within it", () => {
    const day = inDays(400)
    expect(checkVisaLeaseAlignment(day, day).compatible).toBe(true)
  })
})
