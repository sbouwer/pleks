/**
 * lib/screening/__tests__/bundle-runner.test.ts — the real runStandardBundle: skipped products are not called, and a
 * product call that THROWS becomes a failed line (ADDENDUM_14W §0c; walker 14w-s0c F1, F2, F7)
 *
 * Data:   none — the service client is a recording fake; the vendor product modules are mocked
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = Record<string, unknown>
const inserts: Row[] = []
let insertError: { message: string } | null = null

// A chainable fake: every filter returns the builder; terminal reads resolve to an SA-ID subject.
function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "update"]) b[m] = () => b
  b.single = async () => ({ data: { id_number: "enc", id_type: "sa_id", searchworx_extracted_data: {} }, error: null })
  b.then = (res: (v: unknown) => unknown) => res({ data: null, error: null })
  b.insert = async (row: Row) => {
    if (table === "application_screening_lines") inserts.push(row)
    return { error: insertError }
  }
  return b
}

const combined = vi.fn()
const vccb = vi.fn()

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => ({ from: builder }) }))
vi.mock("@/lib/crypto/encryption", () => ({ decrypt: () => "8001015009087" }))
vi.mock("@/lib/screening/consentGuard", async (orig) => ({
  ...(await orig<typeof import("@/lib/screening/consentGuard")>()),
  assertScreeningConsent: async () => undefined,
}))
vi.mock("@/lib/searchworx/rates/read", () => ({ currentRates: async () => ({ rates: new Map(), missing: [] }) }))
vi.mock("@/lib/screening/searchworxBureauAdapter", () => ({ extractBureauScores: () => ({}) }))
vi.mock("@/lib/searchworx/products/combinedConsumerCreditReport", async (orig) => ({
  ...(await orig<typeof import("@/lib/searchworx/products/combinedConsumerCreditReport")>()),
  runCombinedConsumerCreditReport: (a: unknown) => combined(a),
}))
vi.mock("@/lib/searchworx/products/vccbIncomeEstimator", async (orig) => ({
  ...(await orig<typeof import("@/lib/searchworx/products/vccbIncomeEstimator")>()),
  runVccbIncomeEstimator: (a: unknown) => vccb(a),
}))

import { runStandardBundle } from "@/lib/screening/bundle-runner"

const C = "combined_consumer_credit_report"
const V = "vccb_income_estimator"
const okCombined = { ok: true, parsed: { searchToken: "t" }, pdfStoragePath: "p", resultSummaryKey: "success_full", envelope: null }
const okVccb = { ok: true, parsed: { searchToken: "t", person: { incomeGrossEstimateCents: 1 } }, pdfStoragePath: "p", resultSummaryKey: "success", envelope: null }
const args = { applicationId: "app-1", subjectType: "co_applicant" as const, subjectId: "co-1", orgId: "org-1" }

beforeEach(() => {
  inserts.length = 0
  insertError = null
  combined.mockReset().mockResolvedValue(okCombined)
  vccb.mockReset().mockResolvedValue(okVccb)
})

describe("runStandardBundle — §0c retry inputs", () => {
  it("calls both products and writes one line each on a fresh run", async () => {
    await runStandardBundle(args)
    expect(combined).toHaveBeenCalledTimes(1)
    expect(vccb).toHaveBeenCalledTimes(1)
    expect(inserts.map((r) => `${r.product_key}:${r.status}`)).toEqual([`${C}:completed`, `${V}:completed`])
  })

  it("a skipped product is NOT CALLED and writes no line — a delivered product is never bought twice", async () => {
    const r = await runStandardBundle({ ...args, screeningRunId: "run-1", skipProducts: [V] })
    expect(vccb).not.toHaveBeenCalled()
    expect(combined).toHaveBeenCalledTimes(1)
    expect(inserts.map((l) => l.product_key)).toEqual([C])
    expect(inserts[0].screening_run_id, "the retry resumes the SAME run").toBe("run-1")
    expect(r.screeningRunId).toBe("run-1")
  })

  it("skipping Combined calls only VCCB", async () => {
    await runStandardBundle({ ...args, screeningRunId: "run-1", skipProducts: [C] })
    expect(combined).not.toHaveBeenCalled()
    expect(inserts.map((l) => l.product_key)).toEqual([V])
  })

  it("a product call that THROWS (timeout, 5xx) becomes a `failed` line, so the bound counts it — it does not throw", async () => {
    combined.mockRejectedValue(new Error("Searchworx timed out after 60s"))
    await expect(runStandardBundle(args)).resolves.toBeDefined()
    expect(inserts.map((r) => `${r.product_key}:${r.status}`)).toEqual([`${C}:failed`, `${V}:completed`])
  })

  it("a line INSERT that fails THROWS — a swallowed insert would leave the attempt counter unchanged forever", async () => {
    insertError = { message: "violates check constraint" }
    await expect(runStandardBundle(args)).rejects.toThrow(/screening line insert failed/)
  })
})
