/**
 * lib/popia/__tests__/coDsar.test.ts — a co-applicant's own DSAR (arc 1): the subject's co rows are resolved by
 * every live key, the plan strips everything keyed to them, and erasure purges their files before the strip.
 * Written for co DSAR walker F6: the first cut passed every test while missing a promoted co entirely (F1).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ilikeLiteral, resolveSubject } from "../anonymiseIdentity"
import { ANONYMISE_PLAN, planForSubject } from "../anonymisePlan"

interface CoRow { id: string; org_id: string; primary_application_id: string; tenant_id: string | null; contact_id: string | null; applicant_email: string }

/** A fake db: applications resolve by exact email; co rows honour eq + a literal-only ILIKE; all else is empty. */
function fakeDb(coRows: CoRow[], leadApps: Array<{ id: string; tenant_id: string | null; applicant_email: string; org_id: string }>) {
  const unescape = (p: string) => p.replace(/\\([\\%_])/g, "$1")
  function builder(table: string) {
    const eqs: Array<[string, unknown]> = []
    let ilike: [string, string] | null = null
    const b: Record<string, unknown> = {}
    for (const m of ["select", "order", "limit", "is", "in", "gt"]) b[m] = () => b
    b.eq = (c: string, v: unknown) => { eqs.push([c, v]); return b }
    b.ilike = (c: string, p: string) => { ilike = [c, p]; return b }
    const rows = (): Array<Record<string, unknown>> => {
      const byTable: Record<string, Array<Record<string, unknown>>> = { application_co_applicants: coRows.map((r) => ({ ...r })), applications: leadApps.map((r) => ({ ...r })) }
      const src = byTable[table] ?? []
      return src.filter((r) => eqs.every(([c, v]) => r[c] === v)
        && (!ilike || String(r[ilike[0]]).toLowerCase() === unescape(ilike[1]).toLowerCase()))
    }
    b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
    b.single = async () => ({ data: rows()[0] ?? null, error: null })
    b.then = (res: (v: unknown) => void) => res({ data: rows(), error: null })
    return b
  }
  return { from: builder } as never
}

const co = (id: string, over: Partial<CoRow>): CoRow => ({
  id, org_id: "org1", primary_application_id: "app-other", tenant_id: null, contact_id: null, applicant_email: "x@y.z", ...over,
})

describe("resolveSubject — the subject's own co rows", () => {
  it("finds a co row by the invite email case-insensitively, by tenant_id, and never across orgs", async () => {
    const db = fakeDb(
      [
        co("c-email", { applicant_email: "Jane.Doe@Gmail.com" }),
        co("c-tenant", { tenant_id: "t1", applicant_email: "old@address.co.za" }),
        co("c-other-org", { org_id: "org2", applicant_email: "jane.doe@gmail.com" }),
        co("c-stranger", { applicant_email: "someone@else.com" }),
      ],
      [{ id: "app-lead", tenant_id: "t1", applicant_email: "jane.doe@gmail.com", org_id: "org1" }],
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "jane.doe@gmail.com" })
    expect(r.coApplicants.map((c) => c.id).sort()).toEqual(["c-email", "c-tenant"])
  })

  it("an email's LIKE metacharacters match literally, never as wildcards", async () => {
    expect(ilikeLiteral("a_b%c\\d@x.com")).toBe("a\\_b\\%c\\\\d@x.com")
    const db = fakeDb([co("c-near", { applicant_email: "aXb@x.com" })], [])
    expect((await resolveSubject(db, { org_id: "org1", email: "a_b@x.com" })).coApplicants).toEqual([])
  })
})

describe("anonymisePlan — groups keyed to the co subject", () => {
  it("strips the co row, its bureau lines, statement classifications, surety-director row and payment email", () => {
    const co = ANONYMISE_PLAN.filter((g) => g.keyFrom === "coApplicantId").map((g) => `${g.table}.${g.keyColumn}`).sort()
    expect(co).toEqual([
      "application_bank_statement_classifications.co_applicant_id",
      "application_co_applicants.id",
      "application_directors.co_applicant_id",
      "application_screening_lines.subject_id",
      "application_screening_payments.subject_id",
    ])
    for (const g of ANONYMISE_PLAN.filter((x) => x.keyFrom === "coApplicantId")) {
      expect(planForSubject("applicant").map((x) => x.id), g.id).toContain(g.id)
    }
  })

  it("the co row strip covers the free-form PII and revokes the access link", () => {
    const self = ANONYMISE_PLAN.find((g) => g.id === "C.application_co_applicants.self")
    for (const col of ["current_address", "spouse_info", "section_data", "applicant_motivation", "motivation_doc_path",
      "identity_match_reference", "stage1_consent_ip", "stage2_consent_ip", "access_token"]) {
      expect(self?.fields, col).toHaveProperty(col, null)
    }
  })
})

describe("erasure order (source)", () => {
  const erasure = readFileSync(join(process.cwd(), "lib/popia/erasure.ts"), "utf8")
  it("files are purged before the identity strip, and the co purge runs before the lead early-return", () => {
    expect(erasure.indexOf("await purgeSubjectScreeningStorage(db, resolved")).toBeLessThan(erasure.indexOf("await executeIdentityAnonymise(db, resolved"))
    const body = erasure.slice(erasure.indexOf("async function purgeSubjectScreeningStorage"))
    expect(body.indexOf("await eraseSubjectCoDocs(")).toBeLessThan(body.indexOf("if (resolved.applicationIds.length === 0) return"))
  })
  it("a failed co document or bureau-PDF purge throws — the request is never completed over surviving files", () => {
    expect(erasure).toMatch(/co-applicant folder\(s\) — erasure aborted before the identity strip/)
    expect(erasure).toMatch(/co bureau PDF purge failed[^\n]*erasure aborted before the identity strip/)
  })
})
