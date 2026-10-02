/**
 * lib/searchworx/rates/__tests__/billing.test.ts — billing-report rows → observations (ADDENDUM_14V §3.2b)
 *
 * Notes:  Probe-first, both directions. The POPIA probe plants a subject ID in Description and asserts it is
 *         nowhere in the output. Row shape is the 2026-10-01 UAT spike's (every value a string).
 */
import { describe, expect, it } from "vitest"
import { billingObservations } from "@/lib/searchworx/rates/billing"

const SUBJECT_ID = "8001015009087"

function row(over: Record<string, unknown> = {}) {
  return {
    BranchName: "Head Office",
    BillDate: "2026-09-30 10:15:02.123",
    User: "pleks.api",
    Reference: "line-1",
    SearchType: "Combined Consumer Credit Report",
    Description: `${SUBJECT_ID} SMITH J`,
    Quantity: "1",
    UnitPrice: "170.00",
    Cost: "170.00",
    ...over,
  }
}

describe("billingObservations", () => {
  it("maps a billed row to an exact billing_report observation at UnitPrice, dated to the bill", () => {
    const { observations, unmapped, rejected } = billingObservations([row()], "2026-09-30")
    expect(rejected).toEqual([])
    expect(unmapped).toEqual([])
    expect(observations).toEqual([
      {
        productKey: "combined_consumer_credit_report",
        costExclVatCents: 17000,
        source: "billing_report",
        sourceRef: "line-1",
        mappingConfidence: "exact",
        vendorEffectiveDate: "2026-09-30",
        raw: {
          billing_key: "2026-09-30 10:15:02.123|Combined Consumer Credit Report|line-1",
          bill_day: "2026-09-30",
          bill_date: "2026-09-30 10:15:02.123",
          search_type: "Combined Consumer Credit Report",
          quantity: 1,
        },
      },
    ])
  })

  it("PLANTED (POPIA): Description, User and BranchName never reach an observation", () => {
    const out = JSON.stringify(billingObservations([row(), row({ SearchType: "CIPC Company", UnitPrice: "15.65" })], "2026-09-30"))
    expect(out).not.toContain(SUBJECT_ID)
    expect(out).not.toContain("SMITH")
    expect(out).not.toContain("pleks.api")
    expect(out).not.toContain("Head Office")
  })

  it("matches billing names case-insensitively, and a billed inferred mapping becomes exact", () => {
    const { observations } = billingObservations(
      [row({ SearchType: "CIPC Company", UnitPrice: "15.65" }), row({ SearchType: "Lightstone Erf Valuation Short", UnitPrice: "40.00", Reference: "l2" })],
      "2026-09-30",
    )
    expect(observations.map((o) => [o.productKey, o.costExclVatCents, o.mappingConfidence])).toEqual([
      ["cipc_company", 1565, "exact"],
      ["lightstone_erf_short", 4000, "exact"],
    ])
  })

  it("reports an unknown billing name and records nothing for it — never guessed", () => {
    const { observations, unmapped } = billingObservations([row({ SearchType: "Deeds Office Search" }), row({ SearchType: "Deeds Office Search", Reference: "x" })], "2026-09-30")
    expect(observations).toEqual([])
    expect(unmapped).toEqual(["Deeds Office Search"])
  })

  it.each([
    [{ UnitPrice: "R170" }, "UnitPrice"],
    [{ UnitPrice: "170.0000" }, "UnitPrice"],
    [{ BillDate: "30/09/2026" }, "BillDate"],
    [{ Quantity: "0" }, "Quantity"],
    [{ SearchType: undefined }, "missing"],
    [{ UnitPrice: 170 }, "missing"],
  ])("PLANTED: an unreadable row %o is rejected, not skipped", (over, reason) => {
    const { observations, rejected } = billingObservations([row(over)], "2026-09-30")
    expect(observations).toEqual([])
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toContain(reason)
  })

  it("KNOWN-GOOD: an empty day is no observations and no rejections", () => {
    expect(billingObservations([], "2026-09-30")).toEqual({ observations: [], unmapped: [], rejected: [] })
  })

  it("an exact repeat in one fetch gets an ordinal key, so both are kept and a re-fetch matches both", () => {
    const keys = billingObservations([row(), row()], "2026-09-30").observations.map((o) => o.raw?.billing_key)
    expect(keys).toEqual([
      "2026-09-30 10:15:02.123|Combined Consumer Credit Report|line-1",
      "2026-09-30 10:15:02.123|Combined Consumer Credit Report|line-1#2",
    ])
  })

  it("a row with no Reference still gets a source_ref", () => {
    const [o] = billingObservations([row({ Reference: "" })], "2026-09-30").observations
    expect(o.sourceRef).toBe("billing:2026-09-30 10:15:02.123")
  })
})
