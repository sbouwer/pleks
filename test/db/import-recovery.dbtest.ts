/**
 * test/db/import-recovery.dbtest.ts — a dropped connection retries itself, once, and says so
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Crash-convergence proved a re-run is SAFE. This proves we actually do it for the agency, instead of
 *         handing them a page of "Insert failed: fetch failed" — which is not a data problem they can fix by
 *         editing their spreadsheet, and not something they should have to diagnose.
 *
 *         The whole design rests on one distinction: INFRASTRUCTURE failures are worth retrying (the plumbing
 *         broke, the data is fine), DATA failures are not (the same negative rent will be refused for the same
 *         reason, forever). A retry that cannot tell them apart is a machine for doing the wrong thing twice as
 *         fast.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport } from "@/lib/import/importRunner"
import { runImportWithRecovery, isInfrastructureFailure } from "@/lib/import/recovery"
import { generateBook } from "@/test/import/book"
import { render, type RenderedBook } from "@/test/import/dialect"
import { contentHash } from "@/test/import/reconcile"
import { crashAfter, failReadsOn } from "@/test/import/crashClient"

const db = svc()

function wireOf(book: RenderedBook) {
  const suggestions = matchColumns(book.headers)
  const w: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }
  return w
}

const decisionsFor = (book: RenderedBook) =>
  toImportDecisions({
    columnMapping: wireOf(book), expiredLeaseAction: "import_as_expired",
    bankConsentAttested: true, depositsHeldAttested: true, fileHeaders: book.headers,
  })

describe("RECOVERY — a dropped connection retries itself", () => {
  let agentId: string
  const orgs: string[] = []

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  it("classifies the plumbing from the data — and never the other way round", () => {
    // The load-bearing distinction, asserted directly. Retrying a negative rent is a slower way to produce the
    // same report; retrying a dropped socket is free and almost always works.
    for (const infra of [
      "Insert failed: fetch failed",
      "Property/unit error: injected crash: connection lost after 4 write(s)",
      "Insert failed: ECONNRESET",
      "Insert failed: socket hang up",
      "canceling statement due to statement timeout",
    ]) expect(isInfrastructureFailure(infra), infra).toBe(true)

    for (const data of [
      "Rent is NEGATIVE (-6600.50). A lease cannot bill a negative amount",
      'Unrecognised lease type "Sectional Title"',
      "The lease ENDS (2024-01-01) BEFORE IT STARTS (2025-01-01)",
      "This looks like an SA ID number but fails its checksum",
    ]) expect(isInfrastructureFailure(data), data).toBe(false)
  })

  it("the connection drops mid-book: the import re-runs itself and the whole book lands", async () => {
    const truth = generateBook({ seed: 88, leases: 6, landlords: 1, variety: true })
    const book = render(truth, "en-ZA")

    // The reference: what a clean, uninterrupted run produces.
    const cleanOrg = await seedEmptyOrg(db)
    orgs.push(cleanOrg)
    await runImport(book.rows, toColumnMapping(wireOf(book)), decisionsFor(book), cleanOrg, agentId, undefined, db)
    const cleanState = await contentHash(db, cleanOrg)

    // A connection that drops at write 5 and comes back six writes later — which is what a real blip looks
    // like. (A window so wide that it is STILL down during the retry does not test recovery; it tests the
    // failure path, which the last case in this file covers deliberately.)
    const org = await seedEmptyOrg(db)
    orgs.push(org)
    const { client } = crashAfter(db, 4, 6)

    const result = await runImportWithRecovery(
      book.rows, toColumnMapping(wireOf(book)), decisionsFor(book),
      org, agentId, undefined, client as SupabaseClient,
    )

    expect(result.autoRetried, "a dropped connection must trigger exactly one automatic re-run").toBe(true)

    expect(
      await contentHash(db, org),
      "after the automatic retry the agency's database must hold EXACTLY the book a clean run would have " +
      "produced — nothing missing, and nothing duplicated. That is what makes retrying safe to do FOR them.",
    ).toBe(cleanState)
  }, 300_000)

  it("the agency is TOLD it happened — a silent self-heal is still a lie by omission", async () => {
    const truth = generateBook({ seed: 89, leases: 5 })
    const book = render(truth, "en-ZA")
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const { client } = crashAfter(db, 4, 6)
    const result = await runImportWithRecovery(
      book.rows, toColumnMapping(wireOf(book)), decisionsFor(book),
      org, agentId, undefined, client as SupabaseClient,
    )

    const notice = result.errors.find((e) => e.rowIndex === -1 && /connection/i.test(e.message))
    expect(notice, "the agency must be told their connection dropped and that we re-ran it").toBeTruthy()
    expect(notice!.message).toMatch(/automatically/i)
    expect(notice!.message).toMatch(/nothing was duplicated/i)
    expect(notice!.severity, "it worked, so this is information — not an error to act on").toBe("warning")
  }, 180_000)

  it("a DATA error is never retried — the same bad row would just be refused twice", async () => {
    // The negative control. If this retried, every refused row would double the work for no benefit, and the
    // agency would wait twice as long to be told exactly what they were going to be told anyway.
    const truth = generateBook({ seed: 90, leases: 3 })
    const book = render(truth, "en-ZA")
    book.rows[1]["Monthly Rent"] = "-6600.50"      // incoherent: refused, not retried

    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const result = await runImportWithRecovery(
      book.rows, toColumnMapping(wireOf(book)), decisionsFor(book), org, agentId, undefined, db,
    )

    expect(result.autoRetried, "a refused row is not a broken connection").toBe(false)
    expect(result.leasesCreated, "the good rows still land").toBe(2)
    expect(
      result.errors.some((e) => e.severity === "error" && e.rowIndex === 1),
      "and the bad row is still refused, by name",
    ).toBe(true)
  }, 180_000)

  it("if the connection is still down on the retry, it says THAT — and does not loop", async () => {
    // One retry, not "until it works". A genuinely dead database would retry forever and the agency would watch
    // a spinner instead of being told the truth.
    const truth = generateBook({ seed: 91, leases: 4 })
    const book = render(truth, "en-ZA")
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const { client } = crashAfter(db, 4)           // never heals
    const result = await runImportWithRecovery(
      book.rows, toColumnMapping(wireOf(book)), decisionsFor(book),
      org, agentId, undefined, client as SupabaseClient,
    )

    expect(result.autoRetried, "it tried").toBe(true)
    const notice = result.errors.find((e) => e.rowIndex === -1 && /connection/i.test(e.message))
    expect(notice?.severity, "the retry failed too — this IS something to act on").toBe("error")
    expect(notice!.message).toMatch(/safe to press Import again/i)
  }, 180_000)

  it("the retry runs while READS are still failing — and still does not duplicate a lease or a deposit", async () => {
    // THE CASE THE ORIGINAL PROOF MISSED, and the one the auto-retry actually exists for.
    //
    // A real dropped connection fails SELECTs, not just INSERTs. Every "does this already exist?" guard in the
    // importer is a SELECT — so if a failed lookup reads as "not found", the retry re-runs the book while the
    // database is still flapping, a dedup lookup errors, the guard falls open, and a SECOND active lease is
    // created for the same tenant and unit. postOpeningDeposit keys on lease_id, so a new lease is a new key:
    // it posts a SECOND opening balance into the TRUST LEDGER. The agency's trust account then over-states the
    // deposits it holds, and the ledger disagrees with the bank.
    //
    // The old crash client passed reads through untouched, so no test in this suite could see it. The guards now
    // fail CLOSED — a lookup that failed is not a lookup that found nothing — and this is the test that says so.
    const truth = generateBook({ seed: 92, leases: 6, variety: true })
    const book = render(truth, "en-ZA")

    const cleanOrg = await seedEmptyOrg(db)
    orgs.push(cleanOrg)
    await runImport(book.rows, toColumnMapping(wireOf(book)), decisionsFor(book), cleanOrg, agentId, undefined, db)
    const cleanState = await contentHash(db, cleanOrg)

    const org = await seedEmptyOrg(db)
    orgs.push(org)

    // Reads AND writes fail in the window — the honest shape of a pooler blip.
    const { client } = crashAfter(db, 6, 25, { failReads: true })
    await runImportWithRecovery(
      book.rows, toColumnMapping(wireOf(book)), decisionsFor(book),
      org, agentId, undefined, client as SupabaseClient,
    )

    // Whatever the run managed, it may not have DUPLICATED anything. One active lease per unit, and one
    // opening balance per lease — those are the two invariants a fallen-open dedup guard destroys.
    const { data: leases, error: le } = await db
      .from("leases").select("id, unit_id, status").eq("org_id", org).eq("status", "active")
    expect(le).toBeFalsy()

    const byUnit = new Map<string, number>()
    for (const l of leases ?? []) byUnit.set(l.unit_id as string, (byUnit.get(l.unit_id as string) ?? 0) + 1)
    const doubledUnits = [...byUnit.entries()].filter(([, n]) => n > 1)
    expect(
      doubledUnits.map(([u, n]) => `unit ${u} has ${n} active leases`),
      "a failed dedup LOOKUP must never be read as 'this lease does not exist yet' — that creates a second " +
      "active lease on the same unit, and with it a second opening balance in the trust ledger",
    ).toEqual([])

    const { data: deposits, error: de } = await db
      .from("deposit_transactions").select("lease_id").eq("org_id", org).eq("transaction_type", "deposit_received")
    expect(de).toBeFalsy()
    const byLease = new Map<string, number>()
    for (const d of deposits ?? []) byLease.set(d.lease_id as string, (byLease.get(d.lease_id as string) ?? 0) + 1)
    expect(
      [...byLease.entries()].filter(([, n]) => n > 1).map(([l, n]) => `lease ${l} has ${n} opening balances`),
      "other people's money: one opening balance per lease, or the trust account over-states what is held",
    ).toEqual([])

    // LANDLORDS AND CONTACTS. The first version of this test counted leases and deposits ONLY — so the landlord
    // path could duplicate freely and the suite stayed green. That is the SAME shape as the bug this test was
    // written to catch: the proof not covering a path the feature walks. It recurred one level in, and the
    // pre-PR walk caught it again.
    //
    // A duplicated owner is not cosmetic: owner-statement attribution and PAYOUTS split across two identities.
    // And there is no database backstop — `contacts` has no unique on (org_id, primary_email), and
    // uq_landlords_org_contact_live is on (org_id, contact_id), which a fall-through defeats by minting a FRESH
    // contact_id every time.
    const { data: contacts, error: ce } = await db
      .from("contacts").select("primary_email, primary_role").eq("org_id", org)
    expect(ce).toBeFalsy()

    const byEmail = new Map<string, number>()
    for (const c of contacts ?? []) {
      const key = `${c.primary_role}:${String(c.primary_email ?? "").toLowerCase()}`
      byEmail.set(key, (byEmail.get(key) ?? 0) + 1)
    }
    expect(
      [...byEmail.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k} exists ${n} times`),
      "a failed dedup LOOKUP must never mint a second contact for a person who already exists — a duplicated " +
      "OWNER splits their statement attribution and their payouts",
    ).toEqual([])

    const { data: landlords, error: lle } = await db
      .from("landlords").select("id, contact_id").eq("org_id", org)
    expect(lle).toBeFalsy()
    const byContact = new Map<string, number>()
    for (const l of landlords ?? []) byContact.set(l.contact_id as string, (byContact.get(l.contact_id as string) ?? 0) + 1)
    expect(
      [...byContact.entries()].filter(([, n]) => n > 1).map(([c, n]) => `contact ${c} has ${n} landlord rows`),
      "one landlord per contact",
    ).toEqual([])

    // And once the connection is healthy, a further re-run must still converge on the clean book.
    await runImport(book.rows, toColumnMapping(wireOf(book)), decisionsFor(book), org, agentId, undefined, db)
    expect(
      await contentHash(db, org),
      "after the blip passes, a re-run converges on exactly the book a clean run would have produced",
    ).toBe(cleanState)
  }, 300_000)

  it("a re-run whose LANDLORD lookup fails does not mint a second owner", async () => {
    // THE CASE THE PREVIOUS TEST WALKED PAST. The landlord phase runs LAST, so a counter-based crash window
    // opens and closes long before it — the landlord dedup lookup always ran on a healthy connection, the guard
    // was never exercised, and the suite stayed green over a wide-open fail-open. That is the SAME shape as the
    // bug this file exists to catch, recurring one level in. If a failure cannot be STEERED at the path under
    // test, the test is measuring its own reach and not the code's correctness.
    //
    // A duplicated OWNER is not cosmetic: owner-statement attribution and PAYOUTS split across two identities.
    // And there is no database backstop — `contacts` has no unique on (org_id, primary_email), and
    // uq_landlords_org_contact_live is on (org_id, contact_id), which the fall-through defeats by minting a
    // FRESH contact_id every time.
    const truth = generateBook({ seed: 93, leases: 3, landlords: 2, variety: true })
    const book = render(truth, "en-ZA")

    const org = await seedEmptyOrg(db)
    orgs.push(org)

    // A clean first run: the landlords exist.
    await runImport(book.rows, toColumnMapping(wireOf(book)), decisionsFor(book), org, agentId, undefined, db)
    const { data: before, error: be } = await db.from("landlords").select("id").eq("org_id", org)
    expect(be).toBeFalsy()
    expect(before?.length, "the first run creates the owners").toBeGreaterThan(0)

    // The re-run — with the landlord dedup lookup FAILING, which is the whole point.
    const blind = failReadsOn(db, ["landlord_view"])
    await runImportWithRecovery(
      book.rows, toColumnMapping(wireOf(book)), decisionsFor(book), org, agentId, undefined, blind,
    ).catch((e) => {
      // A hard abort is an acceptable outcome — refusing is fail-CLOSED. Creating a duplicate is not.
      if (!(e instanceof Error)) throw e
    })

    const { data: after, error: ae } = await db.from("landlords").select("id, contact_id").eq("org_id", org)
    expect(ae).toBeFalsy()
    expect(
      after?.length,
      "the landlord lookup FAILED — which is not the same as finding nothing. Falling through creates a second " +
      "contact and a second landlord for an owner who already exists, and their payouts split in two.",
    ).toBe(before?.length)

    const { data: cts, error: ce2 } = await db
      .from("contacts").select("primary_email").eq("org_id", org).eq("primary_role", "landlord")
    expect(ce2).toBeFalsy()
    const emails = (cts ?? []).map((c) => String(c.primary_email ?? "").toLowerCase())
    expect(
      emails.length - new Set(emails).size,
      "…and no duplicate landlord CONTACT either",
    ).toBe(0)
  }, 300_000)
})
