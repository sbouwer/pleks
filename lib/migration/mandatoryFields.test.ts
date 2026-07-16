/**
 * lib/migration/mandatoryFields.test.ts — the §4 registry: one list, read the same way by every consumer
 *
 * Notes:  These pin the two things the three consumers all depend on: the missing-field SET is computed by storage
 *         column (so import, the server gate, and first-touch all agree), and "absent" means null/empty/whitespace
 *         — not merely undefined — so a record imported with `city: ""` is flagged, not silently counted complete.
 */
import { describe, it, expect } from "vitest"
import { missingMandatoryFields, isRecordComplete, MANDATORY_FIELDS } from "./mandatoryFields"

describe("missingMandatoryFields — the incomplete_mandatory set", () => {
  it("a property with only a name is missing address+city+province (the MRI case)", () => {
    expect(missingMandatoryFields("property", { name: "Twin Peaks" }))
      .toEqual(["address_line1", "city", "province"])
  })

  it("a full property is complete", () => {
    const p = { name: "Twin Peaks", address_line1: "1 Main Rd", city: "Cape Town", province: "WC" }
    expect(missingMandatoryFields("property", p)).toEqual([])
    expect(isRecordComplete("property", p)).toBe(true)
  })

  it("an email-less tenant is flagged on primary_email — instance #1 of the policy", () => {
    const t = { first_name: "Nomsa", last_name: "Dlamini", primary_email: null, primary_phone: "0821112222" }
    expect(missingMandatoryFields("tenant", t)).toEqual(["primary_email"])
  })

  it("blank/whitespace counts as absent — not silently complete", () => {
    expect(missingMandatoryFields("property", { name: "X", address_line1: "  ", city: "", province: "WC" }))
      .toEqual(["address_line1", "city"])
  })

  it("a lease needs a start date and a rent", () => {
    expect(missingMandatoryFields("lease", { start_date: "2024-01-01", rent_amount_cents: 886000 })).toEqual([])
    expect(missingMandatoryFields("lease", { rent_amount_cents: 886000 })).toEqual(["start_date"])
  })

  it("landlord and tenant share the same mandatory floor (both are contacts)", () => {
    expect(MANDATORY_FIELDS.landlord).toEqual(MANDATORY_FIELDS.tenant)
  })

  it("a JURISTIC contact (company_name set) is NOT flagged for first/last — a company has no first name", () => {
    const co = { company_name: "DW Plumbing PTY LTD", first_name: null, last_name: null, primary_email: "dw@x.co.za", primary_phone: "0111112222" }
    expect(missingMandatoryFields("landlord", co)).toEqual([])
    // ...but a company still needs a way to reach it:
    expect(missingMandatoryFields("tenant", { company_name: "X Ltd", primary_phone: "0111112222" })).toEqual(["primary_email"])
  })

  it("a natural person with no name is flagged for both first and last", () => {
    expect(missingMandatoryFields("tenant", { primary_email: "a@b.co", primary_phone: "0821112222" }))
      .toEqual(["first_name", "last_name"])
  })
})
