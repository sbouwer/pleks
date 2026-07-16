/**
 * test/db/import-email-optional.dbtest.ts — an email-less legacy party is IMPORTED, not dropped
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  A real migration book carries parties with no email on file — the acceptance run on a real MRI book
 *         (import-mri-acceptance.dbtest.ts) had both a landlord and a tenant with none, and the importer REJECTED
 *         them. A dropped landlord means their payouts group under "unknown"; a dropped tenant is a lease with no
 *         lessee. So on the IMPORT path email is relaxed to a loud WARNING (it stays required on live agent-side
 *         create). Dedup does not depend on email — resolveIdentity matches on SA ID / CIPC / name+phone — so an
 *         email-less party is kept OUT of the email-keyed within-batch cache and two of them never collide on "".
 *
 *         ⚠ EVERY TEST HERE WAS VERIFIED FAILING against the pre-relax code (email-required → row rejected):
 *         the import counts went to 0 and the error came back severity "error". A test that cannot fail is not a
 *         test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportResult } from "@/lib/import/importRunner"

const db = svc()

const HEADERS = ["Type", "First Name", "Surname", "Company Name", "Email", "Cell", "ID Number"] as const

function landlord(o: { first: string; last: string; email: string; phone?: string; id?: string }): Record<string, string> {
  return {
    Type: "Landlord", "First Name": o.first, Surname: o.last, "Company Name": "",
    Email: o.email, Cell: o.phone ?? "0821234567", "ID Number": o.id ?? "",
  }
}

async function importRows(orgId: string, agentId: string, rows: Record<string, string>[]): Promise<ImportResult> {
  const suggestions = matchColumns([...HEADERS])
  const w: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }
  const decisions = toImportDecisions({ columnMapping: w, expiredLeaseAction: "skip" })
  return runImport(rows, toColumnMapping(w), decisions, orgId, agentId, undefined, db)
}

const countLandlords = async (orgId: string) => {
  const { count, error } = await db.from("landlords").select("id", { count: "exact", head: true }).eq("org_id", orgId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// Two DISTINCT 13-digit ID strings. Validity is irrelevant to the match — the importer hashes whatever it is —
// so a synthetic pair is enough to prove "same string → one contact, different strings → two".
const ID_A = "9001010001080"
const ID_B = "9202024002086"

describe("EMAIL-OPTIONAL ON IMPORT — an email-less party is imported, loudly, not dropped", () => {
  let agentId: string
  const orgs: string[] = []
  const org = async () => { const o = await seedEmptyOrg(db); orgs.push(o); return o }

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  it("email-less LANDLORD imports — with a WARNING, not a rejection", async () => {
    const o = await org()
    const res = await importRows(o, agentId, [landlord({ first: "Nomsa", last: "Dlamini", email: "", id: ID_A })])
    expect(await countLandlords(o), "the landlord is imported, not dropped").toBe(1)
    const emailNote = res.errors.find((e) => e.field === "email")
    expect(emailNote?.severity, "named as a WARNING — visible, not a silent drop and not a hard error").toBe("warning")
    expect(res.errors.some((e) => e.severity === "error"), "no hard error on a clean email-less row").toBe(false)
  }, 120_000)

  it("the imported email-less landlord has a NULL primary_email — never an empty string", async () => {
    const o = await org()
    await importRows(o, agentId, [landlord({ first: "Nomsa", last: "Dlamini", email: "", id: ID_A })])
    const { data, error } = await db
      .from("contacts").select("primary_email").eq("org_id", o).eq("primary_role", "landlord")
    if (error) throw new Error(error.message)
    expect(data!).toHaveLength(1)
    expect(data![0].primary_email, "empty email is stored as NULL, not ''").toBeNull()
  }, 120_000)

  it("two DIFFERENT email-less landlords do NOT collide on the empty key", async () => {
    // The trap the relax has to avoid: an email-keyed cache would fold both onto "" and import only one.
    const o = await org()
    await importRows(o, agentId, [
      landlord({ first: "Nomsa", last: "Dlamini", email: "", phone: "0820000001", id: ID_A }),
      landlord({ first: "Pieter", last: "Botha", email: "", phone: "0820000002", id: ID_B }),
    ])
    expect(await countLandlords(o), "two distinct people → two landlords, no empty-email collision").toBe(2)
  }, 120_000)

  it("an email-less landlord still DEDUPS on SA ID across a re-import", async () => {
    const o = await org()
    await importRows(o, agentId, [landlord({ first: "Nomsa", last: "Dlamini", email: "", id: ID_A })])
    await importRows(o, agentId, [landlord({ first: "Nomsa", last: "Dlamini", email: "", id: ID_A })])
    expect(await countLandlords(o), "same ID, no email → still one landlord (identity, not email, dedups)").toBe(1)
  }, 120_000)
})
