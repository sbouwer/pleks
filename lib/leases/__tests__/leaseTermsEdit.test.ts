/**
 * lib/leases/__tests__/leaseTermsEdit.test.ts — the draft lease terms edit: what it accepts, refuses and reports changed
 *
 * Notes:  Both directions per rule: a valid edit yields the exact patch (a stated 0 survives, month-to-month nulls the
 *         end date); a blank money term is REFUSED, never defaulted; a value the leases CHECK would refuse never
 *         reaches the database.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  changedTerms, ESCALATION_TYPES, parseLeaseTermsEdit, SELECTABLE_ESCALATION_TYPES, type LeaseTermsInput,
} from "../leaseTermsEdit"

const valid: LeaseTermsInput = {
  startDate: "2026-11-01", endDate: "2027-10-31", isFixedTerm: true, rent: "12500", deposit: "25000",
  paymentDueDay: "1", escalationPercent: "8", escalationType: "fixed", noticePeriodDays: "20",
}
const errorOf = (over: Partial<LeaseTermsInput>) => {
  const r = parseLeaseTermsEdit({ ...valid, ...over })
  return "error" in r ? r.error : null
}

describe("parseLeaseTermsEdit", () => {
  it("turns a valid edit into the leases patch — never touching the stored escalation review date", () => {
    expect(parseLeaseTermsEdit(valid)).toEqual({
      patch: {
        start_date: "2026-11-01", end_date: "2027-10-31", is_fixed_term: true, rent_amount_cents: 1_250_000,
        deposit_amount_cents: 2_500_000, payment_due_day: "1", escalation_percent: 8, escalation_type: "fixed",
        notice_period_days: 20,
      },
    })
  })

  it("reads only plain decimals — hex, exponent and signed forms are refused", () => {
    expect(errorOf({ rent: "0x10" })).toMatch(/rent/)
    expect(errorOf({ rent: "1e3" })).toMatch(/rent/)
    expect(errorOf({ deposit: "+5" })).toMatch(/deposit/)
    expect(parseLeaseTermsEdit({ ...valid, rent: " 12500.50 " })).toMatchObject({ patch: { rent_amount_cents: 1_250_050 } })
  })

  it("keeps a stated 0% escalation, 0-day notice and R0 deposit; a blank deposit is no deposit", () => {
    const r = parseLeaseTermsEdit({ ...valid, escalationPercent: "0", noticePeriodDays: "0", deposit: "0" })
    expect(r).toMatchObject({ patch: { escalation_percent: 0, notice_period_days: 0, deposit_amount_cents: 0 } })
    expect(parseLeaseTermsEdit({ ...valid, deposit: " " })).toMatchObject({ patch: { deposit_amount_cents: null } })
  })

  it("month-to-month drops the end date whatever the field holds", () => {
    expect(parseLeaseTermsEdit({ ...valid, isFixedTerm: false, endDate: "garbage" }))
      .toMatchObject({ patch: { is_fixed_term: false, end_date: null } })
  })

  it("refuses a missing or invalid term rather than defaulting it", () => {
    expect(errorOf({ startDate: "" })).toMatch(/start date/)
    expect(errorOf({ endDate: "" })).toMatch(/end date/)
    expect(errorOf({ endDate: "2026-11-01" })).toMatch(/after the start/)
    expect(errorOf({ rent: "" })).toMatch(/rent/)
    expect(errorOf({ rent: "0" })).toMatch(/rent/)
    expect(errorOf({ deposit: "-1" })).toMatch(/deposit/)
    expect(errorOf({ escalationPercent: "" })).toMatch(/Escalation/)
    expect(errorOf({ escalationPercent: "101" })).toMatch(/Escalation/)
    expect(errorOf({ noticePeriodDays: "" })).toMatch(/notice/)
    expect(errorOf({ noticePeriodDays: "2.5" })).toMatch(/notice/)
    expect(errorOf({ paymentDueDay: "31" })).toMatch(/due/)
  })

  it("accepts exactly the escalation types the leases CHECK allows, as the schema manifest records it", () => {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/schema-manifest.json"), "utf8")) as Record<string, unknown>
    const check = Object.values(manifest)
      .map((section) => (section as Record<string, { def?: string }> | null)?.leases_escalation_type_check?.def)
      .find(Boolean)
    const allowed = [...(check ?? "").matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1])
    expect(allowed.length).toBeGreaterThan(0)
    expect(ESCALATION_TYPES.map((t) => t.value).sort()).toEqual(allowed.sort())
    expect(SELECTABLE_ESCALATION_TYPES.map((t) => t.value)).toEqual(["fixed"])
    for (const t of ESCALATION_TYPES) expect(errorOf({ escalationType: t.value })).toBeNull()
    expect(errorOf({ escalationType: "cpi_linked" })).toMatch(/escalates/)
    expect(errorOf({ escalationType: "negotiable" })).toMatch(/escalates/)
  })
})

describe("changedTerms", () => {
  const patch = (parseLeaseTermsEdit(valid) as { patch: Parameters<typeof changedTerms>[1] }).patch

  it("reports nothing when the stored lease already says the same, numeric strings included", () => {
    expect(changedTerms({ ...patch, escalation_percent: "8" }, patch)).toEqual([])
  })

  it("reports each term that differs, and a null stored value as changed", () => {
    expect(changedTerms({ ...patch, rent_amount_cents: 1_000_000, end_date: null }, patch).sort())
      .toEqual(["end_date", "rent_amount_cents"])
  })
})
