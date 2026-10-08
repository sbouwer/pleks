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
import { eraseSubjectDocumentRows } from "@/lib/applications/documentRegistry"

interface CoRow { id: string; org_id: string; primary_application_id: string; tenant_id: string | null; contact_id: string | null; applicant_email: string; id_number_hash: string | null }
interface LeadApp { id: string; tenant_id: string | null; applicant_email: string; org_id: string; id_number_hash?: string | null }
type Row = Record<string, unknown>

/** A fake db: rows honour eq, in, and a literal-only case-insensitive ILIKE; `is` is ignored; unknown tables are empty. */
function fakeDb(coRows: CoRow[], leadApps: LeadApp[], more: { contacts?: Row[]; tenants?: Row[]; landlords?: Row[] } = {}) {
  const unescape = (p: string) => p.replace(/\\([\\%_])/g, "$1")
  const tables: Record<string, Row[]> = {
    application_co_applicants: coRows.map((r) => ({ ...r })), applications: leadApps.map((r) => ({ ...r })),
    contacts: more.contacts ?? [], tenants: more.tenants ?? [], landlords: more.landlords ?? [],
  }
  function builder(table: string) {
    const eqs: Array<[string, unknown]> = []
    const ins: Array<[string, unknown[]]> = []
    let ilike: [string, string] | null = null
    const b: Row = {}
    for (const m of ["select", "order", "limit", "is", "gt"]) b[m] = () => b
    b.eq = (c: string, v: unknown) => { eqs.push([c, v]); return b }
    b.in = (c: string, v: unknown[]) => { ins.push([c, v]); return b }
    b.ilike = (c: string, p: string) => { ilike = [c, p]; return b }
    const rows = (): Row[] => (tables[table] ?? []).filter((r) => eqs.every(([c, v]) => r[c] === v)
      && ins.every(([c, vs]) => vs.includes(r[c]))
      && (!ilike || String(r[ilike[0]]).toLowerCase() === unescape(ilike[1]).toLowerCase()))
    b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
    b.single = async () => ({ data: rows()[0] ?? null, error: null })
    b.then = (res: (v: unknown) => void) => res({ data: rows(), error: null })
    return b
  }
  return { from: builder } as never
}

const co = (id: string, over: Partial<CoRow>): CoRow => ({
  id, org_id: "org1", primary_application_id: "app-other", tenant_id: null, contact_id: null, applicant_email: "x@y.z", id_number_hash: null, ...over,
})
const app = (id: string, over: Partial<LeadApp>): LeadApp => ({ id, org_id: "org1", tenant_id: null, applicant_email: "x@y.z", id_number_hash: null, ...over })
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id).sort()
/** Jane's portal account → her tenant row → her contact, which carries her ID hash: the one link a mailbox can't forge. */
const janeAccount = {
  tenants: [{ id: "t-jane", org_id: "org1", auth_user_id: "u-jane", contact_id: "ct-jane" }],
  contacts: [{ id: "ct-jane", org_id: "org1", primary_email: "jane@x.com", id_number_hash: "h-jane" }],
}

describe("resolveSubject — case-insensitive email, org-fenced", () => {
  it("finds a co row by the invite email case-insensitively, by tenant_id, and never across orgs", async () => {
    const db = fakeDb(
      [
        co("c-email", { applicant_email: "Jane.Doe@Gmail.com", id_number_hash: "h-jane" }),
        co("c-tenant", { tenant_id: "t1", applicant_email: "old@address.co.za" }),
        co("c-other-org", { org_id: "org2", applicant_email: "jane.doe@gmail.com" }),
        co("c-stranger", { applicant_email: "someone@else.com" }),
      ],
      [app("app-lead", { tenant_id: "t1", applicant_email: "jane.doe@gmail.com", id_number_hash: "h-jane" })],
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "jane.doe@gmail.com" })
    expect(ids(r.coApplicants)).toEqual(["c-email", "c-tenant"])
  })

  it("finds the subject's LEAD application by email case-insensitively", async () => {
    const db = fakeDb([], [app("app-lead", { applicant_email: "Jane.Doe@Gmail.com" })])
    expect((await resolveSubject(db, { org_id: "org1", email: "jane.doe@gmail.com" })).applicationIds).toEqual(["app-lead"])
  })

  it("an address containing `*` is matched exactly, never as a PostgREST wildcard (walker F4)", async () => {
    const db = fakeDb([co("c-near", { applicant_email: "A*@x.com" })], [])
    expect((await resolveSubject(db, { org_id: "org1", email: "a*@x.com" })).coApplicants).toEqual([])
  })

  it("an email's LIKE metacharacters match literally, never as wildcards", async () => {
    expect(ilikeLiteral("a_b%c\\d@x.com")).toBe("a\\_b\\%c\\\\d@x.com")
    const db = fakeDb([co("c-near", { applicant_email: "aXb@x.com" })], [])
    expect((await resolveSubject(db, { org_id: "org1", email: "a_b@x.com" })).coApplicants).toEqual([])
  })
})

// Stéan ruling 2026-10-06: an email is a mailbox, not a person. Erase what the account link or ONE consistent ID ties
// to the subject; route conflicts to manual review — never erase a third party, never silently keep the subject's row.
describe("resolveSubject — which email matches are the subject", () => {
  it("anchored by the account: a same-ID match is the subject; another ID AND an unhashed match go to review (R1)", async () => {
    const db = fakeDb(
      [
        co("c-spouse", { applicant_email: "jane@x.com", id_number_hash: "h-spouse" }),
        co("c-self", { applicant_email: "jane@x.com", id_number_hash: "h-jane" }),
        co("c-unhashed", { applicant_email: "jane@x.com" }),
      ],
      [],
      janeAccount,
    )
    const r = await resolveSubject(db, { org_id: "org1", user_id: "u-jane", email: "jane@x.com" })
    expect(ids(r.coApplicants)).toEqual(["c-self"])
    expect(ids(r.needsReview)).toEqual(["c-spouse", "c-unhashed"])
  })

  it("no account: two IDs on one mailbox → every email match is review, none erased (walker F2)", async () => {
    const db = fakeDb(
      [co("c-jane", { applicant_email: "home@x.com", id_number_hash: "h-jane" })],
      [app("app-bob", { applicant_email: "home@x.com", id_number_hash: "h-bob" })],
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "home@x.com" })
    expect(r.applicationIds).toEqual([])
    expect(r.coApplicants).toEqual([])
    expect(ids(r.needsReview)).toEqual(["app-bob", "c-jane"])
  })

  it("no account: a missing ID is not agreement — one hashed and one unhashed match are both review (walker R1)", async () => {
    const db = fakeDb(
      [co("c-jane-unstarted", { applicant_email: "home@x.com" })],
      [app("app-bob", { tenant_id: "t-bob", applicant_email: "home@x.com", id_number_hash: "h-bob" })],
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "home@x.com" })
    expect(r.applicationIds).toEqual([])
    expect(r.tenantId).toBeNull()
    expect(ids(r.needsReview)).toEqual(["app-bob", "c-jane-unstarted"])
  })

  it("no account: a contact found by email is a witness, never a voucher (walker R3)", async () => {
    const db = fakeDb(
      [co("c-jane", { applicant_email: "home@x.com", id_number_hash: "h-jane" })],
      [],
      { contacts: [{ id: "ct-bob", org_id: "org1", primary_email: "home@x.com", id_number_hash: "h-bob" }] },
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "home@x.com" })
    expect(r.coApplicants).toEqual([])
    expect(r.contactId).toBeNull()
    expect(ids(r.needsReview)).toEqual(["c-jane", "ct-bob"])
  })

  it("no account: an unhashed match beside a hashed contact is not the mailbox's sole row (walker N1)", async () => {
    const db = fakeDb(
      [co("c-jane", { applicant_email: "home@x.com", primary_application_id: "app-bob" })],
      [app("app-bob", { tenant_id: "t-bob", applicant_email: "home@x.com", id_number_hash: "h-bob" })],
      {
        contacts: [{ id: "ct-bob", org_id: "org1", primary_email: "home@x.com", id_number_hash: "h-bob" }],
        tenants: [{ id: "t-bob", org_id: "org1", contact_id: "ct-bob" }],
      },
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "home@x.com" })
    expect(r.coApplicants).toEqual([])
    expect(r.tenantId).toBeNull()
    expect(ids(r.needsReview)).toEqual(["app-bob", "c-jane", "ct-bob"])
  })

  it("no account: a contact sent to review takes its tenant, landlord and their applications with it (follow-up 1)", async () => {
    const db = fakeDb(
      [co("c-jane", { applicant_email: "home@x.com", id_number_hash: "h-jane" })],
      [app("app-bob-linked", { tenant_id: "t-bob", applicant_email: "bob@work.com", id_number_hash: "h-bob" })],
      {
        contacts: [{ id: "ct-bob", org_id: "org1", primary_email: "HOME@x.com", id_number_hash: "h-bob" }],
        tenants: [{ id: "t-bob", org_id: "org1", contact_id: "ct-bob" }],
        landlords: [{ id: "l-bob", org_id: "org1", contact_id: "ct-bob" }],
      },
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "home@x.com" })
    expect([r.contactId, r.tenantId, r.landlordId]).toEqual([null, null, null])
    expect(r.applicationIds).toEqual([])
    expect(ids(r.needsReview)).toEqual(["c-jane", "ct-bob"])
  })

  it("no account: a contact tied by one ID brings its chain, and a linked row with another ID goes to review", async () => {
    const db = fakeDb(
      [co("c-linked-other", { tenant_id: "t-jane", id_number_hash: "h-other" })],
      [
        app("app-email", { applicant_email: "jane@x.com", id_number_hash: "h-jane" }),
        app("app-linked", { tenant_id: "t-jane", applicant_email: "old@x.com", id_number_hash: "h-jane" }),
      ],
      {
        contacts: [{ id: "ct-jane", org_id: "org1", primary_email: "Jane@x.com", id_number_hash: "h-jane" }],
        tenants: [{ id: "t-jane", org_id: "org1", contact_id: "ct-jane" }],
        landlords: [{ id: "l-jane", org_id: "org1", contact_id: "ct-jane" }],
      },
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "jane@x.com" })
    expect([r.contactId, r.tenantId, r.landlordId]).toEqual(["ct-jane", "t-jane", "l-jane"])
    expect(r.applicationIds.sort()).toEqual(["app-email", "app-linked"])
    expect(ids(r.needsReview)).toEqual(["c-linked-other"])
  })

  it("two contacts on one mailbox are never picked between, even with one ID", async () => {
    const db = fakeDb([], [], {
      contacts: [
        { id: "ct-a", org_id: "org1", primary_email: "jane@x.com", id_number_hash: "h-jane" },
        { id: "ct-b", org_id: "org1", primary_email: "jane@x.com", id_number_hash: "h-jane" },
      ],
      tenants: [{ id: "t-a", org_id: "org1", contact_id: "ct-a" }],
    })
    const r = await resolveSubject(db, { org_id: "org1", email: "jane@x.com" })
    expect([r.contactId, r.tenantId]).toEqual([null, null])
    expect(ids(r.needsReview)).toEqual(["ct-a", "ct-b"])
  })

  it("a contact sent to review is never re-admitted by the tenant backfill (dsar-next walker F1)", async () => {
    const db = fakeDb([], [app("app-1", { applicant_email: "jane@x.com", id_number_hash: "h-jane", tenant_id: "t-a" })], {
      contacts: [
        { id: "ct-a", org_id: "org1", primary_email: "jane@x.com", id_number_hash: "h-jane" },
        { id: "ct-b", org_id: "org1", primary_email: "jane@x.com", id_number_hash: "h-jane" },
      ],
      tenants: [{ id: "t-a", org_id: "org1", contact_id: "ct-a" }],
    })
    const r = await resolveSubject(db, { org_id: "org1", email: "jane@x.com" })
    expect(r.applicationIds).toEqual(["app-1"])
    expect(r.tenantId).toBe("t-a")
    expect(r.contactId).toBeNull()
    expect(ids(r.needsReview)).toEqual(["ct-a", "ct-b"])
  })

  it("an unhashed contact takes the one ID on its own tenant's applications (dsar-next walker F2)", async () => {
    const db = fakeDb([], [app("app-1", { applicant_email: "jane@x.com", id_number_hash: "h-jane", tenant_id: "t-jane" })], {
      contacts: [{ id: "ct-jane", org_id: "org1", primary_email: "jane@x.com", id_number_hash: null }],
      tenants: [{ id: "t-jane", org_id: "org1", contact_id: "ct-jane" }],
    })
    const r = await resolveSubject(db, { org_id: "org1", email: "jane@x.com" })
    expect([r.contactId, r.tenantId]).toEqual(["ct-jane", "t-jane"])
    expect(r.applicationIds).toEqual(["app-1"])
    expect(r.needsReview).toEqual([])
  })

  it("…and that ID still has to agree with the mailbox: a spouse's row on it sends all to review", async () => {
    const db = fakeDb(
      [co("c-spouse", { applicant_email: "jane@x.com", id_number_hash: "h-spouse" })],
      [app("app-1", { applicant_email: "jane@x.com", id_number_hash: "h-jane", tenant_id: "t-jane" })],
      {
        contacts: [{ id: "ct-jane", org_id: "org1", primary_email: "jane@x.com", id_number_hash: null }],
        tenants: [{ id: "t-jane", org_id: "org1", contact_id: "ct-jane" }],
      },
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "jane@x.com" })
    expect([r.contactId, r.tenantId]).toEqual([null, null])
    expect(ids(r.needsReview)).toEqual(["app-1", "c-spouse", "ct-jane"])
  })

  it("no account: one consistent ID across every match is the subject", async () => {
    const db = fakeDb(
      [co("c-a", { applicant_email: "jane@x.com", id_number_hash: "h-a" }), co("c-b", { applicant_email: "JANE@x.com", id_number_hash: "h-a" })],
      [app("app-a", { applicant_email: "Jane@X.com", id_number_hash: "h-a" })],
    )
    const r = await resolveSubject(db, { org_id: "org1", email: "jane@x.com" })
    expect(r.applicationIds).toEqual(["app-a"])
    expect(ids(r.coApplicants)).toEqual(["c-a", "c-b"])
    expect(r.needsReview).toEqual([])
  })

  it("no account: the mailbox's SOLE match is the subject even without an ID (a rejected applicant's usual shape)", async () => {
    const db = fakeDb([], [app("app-only", { applicant_email: "jane@x.com" })])
    const r = await resolveSubject(db, { org_id: "org1", email: "jane@x.com" })
    expect(r.applicationIds).toEqual(["app-only"])
    expect(r.needsReview).toEqual([])
  })

  it("a row sent to review is never re-added through a tenant link found by email (walker R4)", async () => {
    const db = fakeDb(
      [co("c-typo", { applicant_email: "jane@x.com", id_number_hash: "h-typo", tenant_id: "t-jane2" })],
      [app("app-jane", { applicant_email: "jane@x.com", id_number_hash: "h-jane", tenant_id: "t-jane2" })],
      // Anchored through a LANDLORD role, so no tenant is known until the accepted application backfills one.
      { landlords: [{ id: "l-jane", org_id: "org1", auth_user_id: "u-jane", contact_id: "ct-jane" }], contacts: janeAccount.contacts },
    )
    const r = await resolveSubject(db, { org_id: "org1", user_id: "u-jane", email: "jane@x.com" })
    expect(r.tenantId).toBe("t-jane2")
    expect(r.coApplicants).toEqual([])
    expect(ids(r.needsReview)).toEqual(["c-typo"])
  })
})

describe("export — every selected column exists (walker F1: a dead column read as \"no co data\")", () => {
  const src = readFileSync(join(process.cwd(), "lib/popia/export.ts"), "utf8")
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "scripts/schema-manifest.json"), "utf8")) as Record<string, unknown>
  const columnsOf = (table: string): string => JSON.stringify((manifest.tables as Record<string, unknown> | undefined)?.[table] ?? manifest[table])
  for (const [constant, table] of [["APPLICATION_FIELDS", "applications"], ["CO_APPLICATION_FIELDS", "application_co_applicants"]] as const) {
    it(`${constant} ⊆ ${table}`, () => {
      const list = new RegExp(`const ${constant} = "([^"]+)"`).exec(src)?.[1]
      expect(list, constant).toBeTruthy()
      const known = columnsOf(table)
      for (const col of (list ?? "").split(",").map((c) => c.trim())) expect(known, `${table}.${col}`).toContain(`"${col}"`)
    })
  }
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

describe("eraseSubjectDocumentRows — the registry rows of erased files", () => {
  function recorder(failOn?: "retire" | "redact") {
    const calls: Array<{ set: Record<string, unknown>; eqs: Array<[string, unknown]>; liveOnly: boolean }> = []
    const from = () => ({
      update: (set: Record<string, unknown>) => {
        const call = { set, eqs: [] as Array<[string, unknown]>, liveOnly: false }
        calls.push(call)
        const kind = "deleted_at" in set ? "retire" : "redact"
        const error = failOn === kind ? { message: "boom" } : null
        const q = {
          eq: (c: string, v: unknown) => { call.eqs.push([c, v]); return q },
          is: () => { call.liveOnly = true; return q },
          then: (res: (v: unknown) => void) => res({ error }),
        }
        return q
      },
    })
    return { db: { from } as never, calls }
  }
  const args = { orgId: "org1", applicationId: "app1", subjectRef: "co_c1", redacted: "[erased]" }

  it("retires the live rows and redacts the path on every row of that subject, org-scoped", async () => {
    const { db, calls } = recorder()
    expect(await eraseSubjectDocumentRows(db, args)).toBe(true)
    const [retire, redact] = calls
    expect(retire.liveOnly).toBe(true)
    expect(redact).toMatchObject({ set: { storage_path: "[erased]" }, liveOnly: false })
    for (const c of calls) expect(c.eqs).toEqual([["org_id", "org1"], ["application_id", "app1"], ["subject_ref", "co_c1"]])
  })

  it("reports a failed write so erasure can stop", async () => {
    expect(await eraseSubjectDocumentRows(recorder("redact").db, args)).toBe(false)
    expect(await eraseSubjectDocumentRows(recorder("retire").db, args)).toBe(false)
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
  it("the purged files' registry rows are retired and redacted, lead and co, before the strip (walker F5)", () => {
    const body = erasure.slice(erasure.indexOf("async function purgeSubjectScreeningStorage"))
    expect(body).toMatch(/subjectRef: "primary"/)
    expect(body).toMatch(/subjectRef: `co_\$\{c\.id\}`/)
    expect(erasure).toMatch(/application_documents redaction failed[^\n]*erasure aborted before the identity strip/)
  })
})
