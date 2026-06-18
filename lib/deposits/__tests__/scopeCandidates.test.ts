/**
 * lib/deposits/__tests__/scopeCandidates.test.ts — deposit-interest config scope hierarchy (ADDENDUM_69A)
 *
 * Locks the resolution order: account → unit → property → org default. The account scope (new in 69A)
 * must be the most specific match so a rate tied to the deposit-holding account wins; the org default is
 * always the final fallback. Non-account candidates carry bank_account_id null so the query filters them.
 */
import { describe, it, expect } from "vitest"
import { buildScopeCandidates } from "../interestConfig"

describe("buildScopeCandidates", () => {
  it("orders account → unit → property → org when all present", () => {
    expect(buildScopeCandidates("ba-1", "prop-1", "unit-1")).toEqual([
      { bank_account_id: "ba-1", property_id: null, unit_id: null },
      { bank_account_id: null, property_id: "prop-1", unit_id: "unit-1" },
      { bank_account_id: null, property_id: "prop-1", unit_id: null },
      { bank_account_id: null, property_id: null, unit_id: null },
    ])
  })

  it("account scope is most specific (first) and org default is always last", () => {
    const c = buildScopeCandidates("ba-1", "prop-1", "unit-1")
    expect(c[0].bank_account_id).toBe("ba-1")
    expect(c[c.length - 1]).toEqual({ bank_account_id: null, property_id: null, unit_id: null })
  })

  it("omits the account candidate when no account is given (back-compat)", () => {
    expect(buildScopeCandidates(null, "prop-1", "unit-1")).toEqual([
      { bank_account_id: null, property_id: "prop-1", unit_id: "unit-1" },
      { bank_account_id: null, property_id: "prop-1", unit_id: null },
      { bank_account_id: null, property_id: null, unit_id: null },
    ])
  })

  it("org-only context still yields the org default candidate", () => {
    expect(buildScopeCandidates(null, null, null)).toEqual([
      { bank_account_id: null, property_id: null, unit_id: null },
    ])
  })

  it("account-only context: account candidate then org fallback", () => {
    expect(buildScopeCandidates("ba-9", null, null)).toEqual([
      { bank_account_id: "ba-9", property_id: null, unit_id: null },
      { bank_account_id: null, property_id: null, unit_id: null },
    ])
  })
})
