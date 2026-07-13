/**
 * test/db/import-identity.dbtest.ts — is this person already in the system?
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  The importer deduplicated on EMAIL alone. So `john@acme.co.za` on the old system and
 *         `j.smith@acme.co.za` on the rent roll became two contacts, two landlords, TWO PAYOUT IDENTITIES —
 *         for one man. And `contacts.id_number_hash` — a deterministic SHA-256 of the SA ID — was written on
 *         every import and used for matching NEVER. We stored the right key and matched on a weaker one.
 *
 *         CONFIDENCE IS A TRIAGE SIGNAL, NEVER A MERGE AUTHORITY. The band decides prompt-vs-create; it does
 *         not decide merge-vs-not. Merge authority comes only from an exact deterministic key, or the agent's
 *         explicit confirmation — so not even a 0.94 match fuses two identities.
 *
 *         Because the failure modes are ASYMMETRIC:
 *           a FALSE MERGE fuses two people's ledgers and attributes one person's data to another. POPIA breach,
 *           near-irreversible.
 *           a FALSE SPLIT is two records for one person. Annoying, visible, reversible in a minute.
 *         So the band fails toward the REVERSIBLE error, and a held row is a LOUD, NAMED refusal — never a
 *         silent skip. "I would rather not import than import wrong — as long as the agent knows."
 *
 *         ⚠ EVERY TEST HERE WAS VERIFIED FAILING against the email-only dedup before it was allowed to pass.
 *         Three separate times this fortnight a probe passed only because it could not produce the failure it
 *         existed to catch. A test that cannot fail is not a test.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportResult } from "@/lib/import/importRunner"

const db = svc()

const HEADERS = [
  "Type", "First Name", "Surname", "Company Name", "Email", "Cell", "ID Number", "Registration Number",
] as const

/** One landlord row. The SAME person can be written with a different email — which is the whole point. */
function landlord(o: {
  first: string; last: string; email: string; phone?: string; id?: string; reg?: string
}): Record<string, string> {
  return {
    Type: "Landlord",
    "First Name": o.first,
    Surname: o.last,
    "Company Name": "",
    Email: o.email,
    Cell: o.phone ?? "0821234567",
    "ID Number": o.id ?? "",
    "Registration Number": o.reg ?? "",
  }
}

/** One supplier row. */
function supplier(o: { company: string; email: string; phone?: string; reg?: string }): Record<string, string> {
  return {
    Type: "Supplier",
    "First Name": "",
    Surname: "",
    "Company Name": o.company,
    Email: o.email,
    Cell: o.phone ?? "0111234567",
    "ID Number": "",
    "Registration Number": o.reg ?? "",
  }
}

const countContractors = async (orgId: string) => {
  const { count, error } = await db
    .from("contractors").select("id", { count: "exact", head: true }).eq("org_id", orgId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function importRows(
  orgId: string, agentId: string, rows: Record<string, string>[],
  identityDecisions?: Record<number, { action: "link"; contactId: string } | { action: "create" }>,
): Promise<ImportResult> {
  const suggestions = matchColumns([...HEADERS])
  const w: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }

  const decisions = toImportDecisions({ columnMapping: w, expiredLeaseAction: "skip" })
  return runImport(rows, toColumnMapping(w), { ...decisions, identityDecisions }, orgId, agentId, undefined, db)
}

const countLandlords = async (orgId: string) => {
  const { count, error } = await db
    .from("landlords").select("id", { count: "exact", head: true }).eq("org_id", orgId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** A real, checksum-valid SA ID. The matcher hashes it; a junk one would match nothing and prove nothing. */
const SA_ID = "9202204720082"

describe("IDENTITY — is this person already in the system?", () => {
  let agentId: string
  const orgs: string[] = []

  const org = async () => {
    const o = await seedEmptyOrg(db)
    orgs.push(o)
    return o
  }

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  it("SAME SA ID, different email → ONE landlord. Not two payout identities for one man.", async () => {
    // The headline case, and the one email-only dedup gets wrong every single time: the agency's old system had
    // john@acme.co.za, the rent roll says j.smith@acme.co.za. Same ID number. Same man.
    const o = await org()

    await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "john@acme.co.za", id: SA_ID,
    })])
    expect(await countLandlords(o), "the first import creates him").toBe(1)

    const second = await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "j.smith@acme.co.za", id: SA_ID,
    })])

    expect(
      await countLandlords(o),
      "the SA ID is an exact, deterministic identity key and it MATCHED — so this is the same man under a new " +
      "email address, and he must not become a second landlord with a second set of payouts",
    ).toBe(1)
    expect(second.identityHolds, "an exact key needs no question asked").toEqual([])
  }, 120_000)

  it("SAME CIPC registration, different email → ONE landlord", async () => {
    const o = await org()
    const reg = "2019/123456/07"

    await importRows(o, agentId, [landlord({
      first: "", last: "", email: "accounts@ubuntu.co.za", reg,
    })])
    const before = await countLandlords(o)
    expect(before).toBe(1)

    await importRows(o, agentId, [landlord({
      first: "", last: "", email: "finance@ubuntu.co.za", reg,
    })])

    expect(await countLandlords(o), "a company's CIPC number is its identity").toBe(1)
  }, 120_000)

  it("different person, different everything → TWO landlords. It does not over-merge.", async () => {
    // The negative control, and it is not padding: a matcher that merges everything would pass every test
    // above. This is the one that proves it is matching rather than collapsing.
    const o = await org()

    await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "john@acme.co.za", phone: "0821111111", id: SA_ID,
    })])
    await importRows(o, agentId, [landlord({
      first: "Thabo", last: "Nkosi", email: "thabo@other.co.za", phone: "0839999999", id: "9202204720082".replace("92", "88"),
    })])

    expect(await countLandlords(o), "two different people are two landlords").toBe(2)
  }, 120_000)

  it("FUZZY — same name and phone, different email, no ID → HELD. Neither merged nor duplicated.", async () => {
    // The grey band, and the whole design. It COULD be the same man who changed his email. It could be his son.
    // We do not know, so we do not guess: the row is NOT imported, and the agency is told precisely that.
    const o = await org()

    await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "john@acme.co.za", phone: "0821234567",
    })])
    expect(await countLandlords(o)).toBe(1)

    const result = await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "jsmith@newmail.co.za", phone: "0821234567",
    })])

    expect(
      await countLandlords(o),
      "NOT auto-duplicated — we think it may be him, and creating a second payout identity on a guess is the " +
      "error we refuse to make quietly",
    ).toBe(1)

    expect(result.identityHolds.length, "…and NOT auto-merged either. The row is HELD.").toBe(1)
    const hold = result.identityHolds[0]
    expect(hold.match.basis).toBe("name_and_phone")
    expect(hold.match.confidence).toBeLessThan(0.95)
    expect(hold.match.confidence).toBeGreaterThanOrEqual(0.6)

    // THE AGENT MUST KNOW. A held row that nobody sees is a row nobody imports — and with a hundred leases you
    // will not notice one missing until it is far too late.
    const told = result.errors.find((e) => e.field === "identity" && e.rowIndex === 0)
    expect(told, "the hold must be reported").toBeTruthy()
    expect(told!.severity, "it did not import — that is an error to act on, not a warning to skim").toBe("error")
    expect(told!.message).toMatch(/NOT IMPORTED/i)
  }, 120_000)

  it("the agent says SAME → we link. The agent says NEW → we create. Their answer is the merge authority.", async () => {
    const o = await org()

    await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "john@acme.co.za", phone: "0821234567",
    })])

    const held = await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "jsmith@newmail.co.za", phone: "0821234567",
    })])
    expect(held.identityHolds).toHaveLength(1)
    const candidate = held.identityHolds[0].match.contactId

    // "Same man." → link. Nothing new is created.
    const linked = await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "jsmith@newmail.co.za", phone: "0821234567",
    })], { 0: { action: "link", contactId: candidate } })
    expect(await countLandlords(o), "confirmed as the same person — linked, not duplicated").toBe(1)
    expect(linked.identityHolds, "and not asked again").toEqual([])

    // "No — different man." → create. THE AGENT'S WORD IS THE AUTHORITY, not the score.
    await importRows(o, agentId, [landlord({
      first: "John", last: "Smith", email: "jsmith@newmail.co.za", phone: "0821234567",
    })], { 0: { action: "create" } })
    expect(await countLandlords(o), "confirmed as someone new — created").toBe(2)
  }, 180_000)

  it("the SAME person in TWO orgs → two records. Identity never matches across the org boundary.", async () => {
    // Two agencies legitimately manage the same landlord. Matching across orgs would be a cross-tenant leak
    // wearing the face of a helpful feature — and it would tell agency A that agency B has this person.
    const a = await org()
    const b = await org()

    const row = [landlord({ first: "John", last: "Smith", email: "john@acme.co.za", id: SA_ID })]
    await importRows(a, agentId, row)
    const result = await importRows(b, agentId, row)

    expect(await countLandlords(a), "org A has him").toBe(1)
    expect(await countLandlords(b), "org B has him TOO — separately").toBe(1)
    expect(result.identityHolds, "and org B was never told org A exists").toEqual([])
  }, 120_000)

  // ── SUPPLIERS. The third entity path, and it must not be left on the old key: a class fix that leaves one
  //    of three paths on email is not a class fix, it is a gap with a clean story.

  it("SUPPLIER — same CIPC registration, different email AND a different name variant → ONE supplier", async () => {
    // The supplier path matched on email, then on an EXACT company name. So "ABC Plumbing" and "ABC Plumbing
    // (Pty) Ltd" were two suppliers — and a supplier whose email changed was a third. Meanwhile their CIPC
    // registration number was being written on every import and matched on never.
    const o = await org()
    const reg = "2015/987654/07"

    await importRows(o, agentId, [supplier({
      company: "ABC Plumbing", email: "accounts@abcplumbing.co.za", reg,
    })])
    expect(await countContractors(o), "the first import creates them").toBe(1)

    await importRows(o, agentId, [supplier({
      company: "ABC Plumbing (Pty) Ltd", email: "finance@abcplumbing.co.za", reg,
    })])

    expect(
      await countContractors(o),
      "the CIPC number is the company's identity — a new email and a longer trading name do not make it a " +
      "second supplier with a second payment history",
    ).toBe(1)
  }, 120_000)

  it("SUPPLIER — a genuinely different company → TWO suppliers", async () => {
    const o = await org()
    await importRows(o, agentId, [supplier({ company: "ABC Plumbing", email: "a@abc.co.za", reg: "2015/987654/07" })])
    await importRows(o, agentId, [supplier({ company: "XYZ Electrical", email: "x@xyz.co.za", reg: "2018/111222/07" })])
    expect(await countContractors(o), "two companies are two suppliers").toBe(2)
  }, 120_000)
})
