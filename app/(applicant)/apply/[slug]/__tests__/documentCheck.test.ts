/**
 * app/(applicant)/apply/[slug]/__tests__/documentCheck.test.ts — poll rules for the review's document check (A18).
 */
import { describe, it, expect } from "vitest"
import { nextPollDelayMs, shouldPoll } from "../documentCheck"

describe("documentCheck poll rules", () => {
  it("polls only while unknown or processing", () => {
    expect(shouldPoll(null)).toBe(true)
    expect(shouldPoll("processing")).toBe(true)
    for (const s of ["done", "failed", "none"] as const) expect(shouldPoll(s)).toBe(false)
  })

  it("backs off from 4s and caps at 30s", () => {
    expect(nextPollDelayMs(0)).toBe(4000)
    expect(nextPollDelayMs(1)).toBe(6000)
    expect(nextPollDelayMs(2)).toBe(9000)
    expect(nextPollDelayMs(50)).toBe(30000)
    expect(nextPollDelayMs(-3)).toBe(4000)
  })
})
