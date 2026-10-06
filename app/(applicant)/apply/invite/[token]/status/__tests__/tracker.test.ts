/**
 * app/(applicant)/apply/invite/[token]/status/__tests__/tracker.test.ts — A12: the tracker claims only what the route said
 *
 * Notes:  Probed both ways. PLANTED: an unpaid status never reads "paid" and never reaches the payment step; a 5xx is
 *         never "missing" (it would tell a payer who just paid that their link is invalid). withdrawn is final, so
 *         polling stops.
 */
import { describe, expect, it } from "vitest"
import { classifyResponse, feeLine, isFinal, statusToStep, type InviteStatus } from "../tracker"

const fmt = (c: number) => `R${c / 100}`
const st = (over: Partial<InviteStatus> = {}): InviteStatus => ({
  reference: "app-1", stage2Status: "pending_payment", feePaid: false, feeCents: 25000, ...over,
})

describe("feeLine", () => {
  it("paid only when the route says so, with the charged amount", () => {
    expect(feeLine(st({ feePaid: true }), fmt)).toBe("Screening fee: R250 paid")
    expect(feeLine(st({ feePaid: true, feeCents: null }), fmt)).toBe("Screening fee paid")
  })

  it("PLANTED: unpaid never says paid; withdrawn says withdrawn", () => {
    expect(feeLine(st(), fmt)).not.toMatch(/paid/i)
    expect(feeLine(st(), fmt)).toContain("confirming your payment")
    expect(feeLine(st({ stage2Status: "withdrawn" }), fmt)).toBe("This application was withdrawn.")
  })
})

describe("statusToStep", () => {
  it("PLANTED: unpaid stops before the payment step", () => {
    expect(statusToStep("pending_payment", false)).toBe(2)
    expect(statusToStep(null, false)).toBe(2)
  })

  it("advances on payment, screening and decision", () => {
    expect(statusToStep("pending_payment", true)).toBe(3)
    expect(statusToStep("screening_in_progress", true)).toBe(4)
    expect(statusToStep("screening_complete", true)).toBe(5)
    expect(statusToStep("approved", true)).toBe(5)
    expect(statusToStep("declined", true)).toBe(5)
  })
})

describe("classifyResponse and isFinal", () => {
  it("not found is 400/404/410 only", () => {
    expect(classifyResponse(200)).toBe("ok")
    for (const s of [400, 404, 410]) expect(classifyResponse(s)).toBe("missing")
  })

  it("PLANTED: a 5xx or other failure retries, never reads as an invalid link", () => {
    for (const s of [500, 502, 503, 429]) expect(classifyResponse(s)).toBe("retry")
  })

  it("approved, declined and withdrawn end the poll; nothing else does", () => {
    for (const s of ["approved", "declined", "withdrawn"]) expect(isFinal(s)).toBe(true)
    for (const s of [null, "invited", "pending_payment", "screening_in_progress", "screening_complete"]) expect(isFinal(s)).toBe(false)
  })
})
