/**
 * lib/screening/__tests__/retryPlan.test.ts — the per-product retry plan after a screening run (ADDENDUM_14W §0c)
 *
 * Data:   none — pure
 */
import { describe, it, expect } from "vitest"
import { planRun } from "@/lib/screening/retryPlan"

const C = "combined_consumer_credit_report"
const V = "vccb_income_estimator"
const line = (product_key: string, status: string) => ({ product_key, status })
const fails = (k: string, n: number) => Array.from({ length: n }, () => line(k, "failed"))

describe("planRun", () => {
  it("everything delivered → settle with nothing terminal", () => {
    expect(planRun([line(C, "completed"), line(V, "completed")])).toEqual({
      action: "settle", delivered: [C, V], completed: [C, V], terminal: [],
    })
  })

  it("a skipped product (VCCB for a foreign national) is delivered, never retried — and is not `completed`", () => {
    expect(planRun([line(C, "completed"), line(V, "skipped")])).toEqual({
      action: "settle", delivered: [C, V], completed: [C], terminal: [],
    })
  })

  it("a failed product under the bound → retry, carrying what is already delivered", () => {
    expect(planRun([...fails(C, 1), line(V, "completed")], 4)).toEqual({ action: "retry", retrying: [C], delivered: [V] })
    expect(planRun([...fails(C, 3), line(V, "completed")], 4)).toEqual({ action: "retry", retrying: [C], delivered: [V] })
  })

  it("the bound reached → terminal, and the subject settles", () => {
    expect(planRun([...fails(C, 4), line(V, "completed")], 4)).toEqual({
      action: "settle", delivered: [V], completed: [V], terminal: [C],
    })
  })

  it("a product that failed and then delivered is delivered, not terminal", () => {
    expect(planRun([...fails(C, 3), line(C, "completed"), line(V, "completed")], 4)).toMatchObject({ action: "settle", terminal: [] })
  })

  it("one product still retrying holds the WHOLE subject, even when another is terminal", () => {
    expect(planRun([...fails(C, 4), ...fails(V, 2)], 4)).toEqual({ action: "retry", retrying: [V], delivered: [] })
  })

  it("defaults to SCREENING_PRODUCT_MAX_ATTEMPTS", () => {
    expect(planRun(fails(C, 3)).action).toBe("retry")
    expect(planRun(fails(C, 4)).action).toBe("settle")
  })
})
