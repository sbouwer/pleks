import { describe, it, expect } from "vitest"
import { ANONYMISE_PLAN, planForSubject, REDACTED } from "../anonymisePlan"

describe("anonymisePlan — §7 (D-5) identity strip-set", () => {
  it("every group strips at least one field", () => {
    for (const g of ANONYMISE_PLAN) {
      expect(Object.keys(g.fields).length, g.id).toBeGreaterThan(0)
    }
  })

  it("group ids are unique", () => {
    const ids = ANONYMISE_PLAN.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("NOT-NULL columns use the REDACTED token, never null (no constraint violation on strip)", () => {
    const mustToken: ReadonlyArray<readonly [string, string]> = [
      ["A.contact_emails", "email"],
      ["A.contact_phones", "number"],
      ["B.tenant_next_of_kin", "full_name"],
      ["B.tenant_bank_accounts", "account_holder"],
      ["B.tenant_bank_accounts", "account_number"],
      ["B.tenant_bank_accounts", "bank_name"],
      ["C.applications", "applicant_email"],
      ["C.application_co_applicants", "applicant_email"],
      ["C.application_directors", "first_name"],
      ["C.application_directors", "last_name"],
      ["C.application_guarantors", "first_name"],
      ["C.application_guarantors", "last_name"],
      ["C.application_tokens", "applicant_email"],
    ]
    for (const [gid, col] of mustToken) {
      const g = ANONYMISE_PLAN.find((x) => x.id === gid)
      expect(g, gid).toBeTruthy()
      expect(g?.fields[col], `${gid}.${col}`).toBe(REDACTED)
    }
  })

  it("applicant scope = C + D + shared A; excludes landlord-only groups", () => {
    const ids = planForSubject("applicant").map((g) => g.id)
    expect(ids).toContain("C.applications")
    expect(ids).toContain("D.communication_log")
    expect(ids).not.toContain("E.properties")
    expect(ids).not.toContain("B.landlords")
  })

  it("landlord scope includes E.properties + B.landlords; excludes tenant-only groups", () => {
    const ids = planForSubject("landlord").map((g) => g.id)
    expect(ids).toContain("E.properties")
    expect(ids).toContain("B.landlords")
    expect(ids).not.toContain("B.tenant_bank_accounts")
    expect(ids).not.toContain("C.applications")
  })

  it("tenant scope includes A + B(tenant) + C + D; excludes E.properties", () => {
    const ids = planForSubject("tenant").map((g) => g.id)
    expect(ids).toContain("A.contacts")
    expect(ids).toContain("B.tenant_bank_accounts")
    expect(ids).toContain("C.applications")
    expect(ids).toContain("D.communication_log")
    expect(ids).not.toContain("E.properties")
  })

  it("the F protect-set + G dead columns are NOT in the plan (accountability retained, §7 F/G)", () => {
    const tables = new Set(ANONYMISE_PLAN.map((g) => g.table))
    for (const t of ["consent_log", "data_subject_requests", "popia_exports", "tos_acceptances", "audit_log", "organisations"]) {
      expect(tables.has(t), t).toBe(false)
    }
  })
})
