/**
 * test/db/import-stress.dbtest.ts — the stress harness: generate truth → render a dialect → import → reconcile
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Ablation asked what the importer INVENTS when a field is absent. Poison asked what it ACCEPTS when a
 *         field lies. Both were hand-authored, one field at a time — which means both are bounded by what I
 *         thought to write down.
 *
 *         This one is not. It generates a whole agency book from a SEED, renders it through the exporters real
 *         agencies actually use, imports it, and compares every landed value against the oracle that produced
 *         it. Nothing is hand-mapped and nothing is hand-expected: if the database disagrees with the book, the
 *         harness says so — whether or not anyone predicted that particular disagreement.
 *
 *         It also covers what the earlier harnesses never touched at all: LANDLORD, SUPPLIER and AGENT rows.
 *         Those three paths had, between them, zero tests — no unit test, no dbtest, no ablation, no poison.
 *
 *         Seeds are the reproduction handle. A failure at seed 41 in af-ZA is replayable forever by passing 41.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportResult, type ImportError } from "@/lib/import/importRunner"
import { generateBook, type GroundTruth } from "@/test/import/book"
import { render, ALL_DIALECTS, type DialectName, type RenderedBook } from "@/test/import/dialect"
import { reconcileLeases, checkInvariants, contentHash } from "@/test/import/reconcile"

const db = svc()

/** The wizard's own path: matchColumns suggests, the wire contract translates, runImport runs. Nothing hand-mapped. */
async function importBook(
  orgId: string, agentId: string, book: RenderedBook,
): Promise<ImportResult> {
  const suggestions = matchColumns(book.headers)
  const wire: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) wire[s.column] = { field: s.field, entity: s.entity }

  return runImport(
    book.rows,
    toColumnMapping(wire),
    toImportDecisions({
      columnMapping: wire,
      expiredLeaseAction: "import_as_expired",
      bankConsentAttested: true,
      depositsHeldAttested: true,
    }),
    orgId, agentId, undefined, db,
  )
}

/** Import a generated book into a fresh org, then reconcile the database against the oracle. */
async function run(
  agentId: string, orgs: string[], truth: GroundTruth, dialect: DialectName,
) {
  const org = await seedEmptyOrg(db)
  orgs.push(org)
  const book = render(truth, dialect)
  const result = await importBook(org, agentId, book)
  const findings = await reconcileLeases(db, org, truth, result)
  const breaches = await checkInvariants(db, org, truth, result)
  return { org, book, result, findings, breaches }
}

const fmtFindings = (fs: Awaited<ReturnType<typeof reconcileLeases>>) =>
  fs.map((f) => `row ${f.row} · ${f.field}: expected ${JSON.stringify(f.expected)}, ` +
    `database holds ${JSON.stringify(f.actual)}${f.silent ? "  ← SILENT" : "  (flagged)"}`)

describe("STRESS — a generated book, rendered through real exporters, reconciled against the oracle", () => {
  let agentId: string
  const orgs: string[] = []

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  // ── 1. THE CONTROL. A clean book must land EXACTLY. ────────────────────────────────────────────

  it("a clean book lands byte-for-byte — every field equals the book that produced it", async () => {
    const truth = generateBook({ seed: 1, leases: 6, variety: true })
    const { findings, breaches, result } = await run(agentId, orgs, truth, "en-ZA")

    expect(result.leasesCreated, "every lease in the book imports").toBe(6)
    expect(fmtFindings(findings), "no landed value may differ from the book").toEqual([])
    expect(breaches.map((b) => `${b.invariant}: ${b.detail}`)).toEqual([])
  }, 120_000)

  // ── 2. DIALECT INVARIANCE. The same book, five exporters, one database. ────────────────────────

  it("the same book imports IDENTICALLY from every exporter — af-ZA, TPN, PayProp, Excel", async () => {
    // This is the assertion that would have caught the 100× comma bug and the day/month swap, both of which
    // shipped. A test that only ever renders one dialect is structurally blind to them: the fixture and the
    // parser agree with each other, and neither is asked to agree with reality.
    const truth = generateBook({ seed: 7, leases: 5, variety: true })
    const table: string[] = []
    const hashes = new Map<DialectName, string>()
    const failures: string[] = []

    for (const dialect of ALL_DIALECTS) {
      const { org, findings, breaches, result } = await run(agentId, orgs, truth, dialect)
      hashes.set(dialect, await contentHash(db, org))

      table.push(`  ${dialect.padEnd(14)} ${result.leasesCreated}/5 leases` +
        `${findings.length ? `  ✗ ${findings.length} mismatch(es)` : "  ✓"}` +
        `${breaches.length ? `  ✗ ${breaches.length} invariant breach(es)` : ""}`)

      for (const f of fmtFindings(findings)) failures.push(`[${dialect}] ${f}`)
      for (const b of breaches) failures.push(`[${dialect}] INVARIANT ${b.invariant}: ${b.detail}`)
    }

    // Every dialect must produce the SAME database. Not merely "no errors" — the same content.
    const distinct = new Set(hashes.values())
    console.log(
      `\n── dialect invariance (seed 7) ──\n${table.join("\n")}\n\n` +
      `  ${distinct.size} distinct database state(s) across ${ALL_DIALECTS.length} exporters ` +
      `(must be 1)\n`,
    )

    expect(failures, "a benign dialect change must not change what lands").toEqual([])
    if (distinct.size > 1) {
      const [a, b] = [...hashes.entries()]
      expect.fail(`the same book produced ${distinct.size} different databases. ` +
        `First divergence: ${a[0]} vs ${b[0]}. The exporter should not be able to change the data.`)
    }
  }, 300_000)

  // ── 3. THE ENTITY PATHS THAT HAD NO TESTS AT ALL. ──────────────────────────────────────────────

  it("landlord, supplier and agent rows all import — the three paths with zero prior coverage", async () => {
    const truth = generateBook({ seed: 11, leases: 2, landlords: 3, vendors: 3, agents: 2, variety: true })
    const { org, result } = await run(agentId, orgs, truth, "en-ZA")

    expect(result.landlordsImported, "landlord rows create landlord entities").toBe(3)
    expect(result.contractorsCreated, "supplier rows create contractors").toBe(3)
    expect(result.agentInvitesSent, "agent rows create invites").toBe(2)

    // The supplier archetypes include managing_scheme and utility — the two values the LOCAL migration used to
    // reject outright, because the migration file had drifted from a production constraint widened out-of-band.
    const { data: suppliers, error } = await db
      .from("contractors").select("supplier_type").eq("org_id", org)
    expect(error).toBeFalsy()
    const types = new Set((suppliers ?? []).map((s) => s.supplier_type))
    expect([...types].sort(), "every supplier archetype survives, not just 'contractor'")
      .toEqual([...new Set(truth.rows.filter((r) => r.entity === "vendor").map((r) => r.supplierType))].sort())
  }, 120_000)

  // ── 4. REPORT HONESTY. Nothing may vanish between the file and the database. ───────────────────

  it("an unrecognised record type is REPORTED, not silently dropped", async () => {
    // `routeRowsByType` used to `break` on an unknown __entity_type with the comment "skip silently". A whole
    // class of an agency's book — "Guarantor", "Beneficiary", a typo'd "Tennant" — could disappear between the
    // file and the database with nothing anywhere saying so. That is the worst failure an importer has, because
    // it is the one the agency cannot detect for themselves.
    const truth = generateBook({ seed: 13, leases: 2 })
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const book = render(truth, "en-ZA")
    book.rows.push({ ...book.rows[0], Type: "Guarantor", Email: "guarantor@example.co.za", "Unit Number": "99" })

    const result = await importBook(org, agentId, book)

    const told = (result.errors as ImportError[]).find((e) => e.field === "__entity_type")
    expect(told, "the unroutable row is named in the report").toBeTruthy()
    expect(told!.message).toContain("Guarantor")
    expect(result.skipped, "…and counted, so imported + skipped accounts for the whole file").toBeGreaterThan(0)
  }, 120_000)

  // ── 5. IDEMPOTENCY. Run the same book twice; the database must not double. ─────────────────────

  it("importing the same book twice leaves the database identical — no doubling", async () => {
    const truth = generateBook({ seed: 17, leases: 4, landlords: 2, vendors: 2, variety: true })
    const org = await seedEmptyOrg(db)
    orgs.push(org)
    const book = render(truth, "en-ZA")

    await importBook(org, agentId, book)
    const first = await contentHash(db, org)

    await importBook(org, agentId, book)
    const second = await contentHash(db, org)

    // An agency WILL re-run an import — after a mapping fix, after a crash, out of simple uncertainty about
    // whether the first one worked. A second run that doubles the book is a catastrophe that looks like success.
    expect(second, "a re-run must converge, not accumulate").toBe(first)
  }, 180_000)

  // ── 6. THE SWEEP. Books nobody designed, at volume. ────────────────────────────────────────────

  it("holds across 8 unrelated seeds — the invariants are true of books nobody sat down and wrote", async () => {
    const failures: string[] = []

    for (const seed of [2, 3, 5, 8, 21, 34, 55, 89]) {
      const truth = generateBook({ seed, leases: 5, landlords: 2, vendors: 2, agents: 1, variety: true })
      const dialect = ALL_DIALECTS[seed % ALL_DIALECTS.length]
      const { findings, breaches } = await run(agentId, orgs, truth, dialect)

      for (const f of findings.filter((x) => x.silent)) {
        failures.push(`seed ${seed} [${dialect}] row ${f.row} · ${f.field}: ` +
          `expected ${JSON.stringify(f.expected)}, database holds ${JSON.stringify(f.actual)} — SILENT`)
      }
      for (const b of breaches) failures.push(`seed ${seed} [${dialect}] INVARIANT ${b.invariant}: ${b.detail}`)
    }

    console.log(`\n── seed sweep: 8 books × their dialect ──\n  ${failures.length} failure(s)\n`)
    expect(failures, "every seed is a replayable fixture — pass the seed to reproduce").toEqual([])
  }, 600_000)

  // ── 7. VOLUME. 100 leases: the report must stay honest at scale. ───────────────────────────────

  it("100 leases: every one lands, money is conserved to the cent", async () => {
    const truth = generateBook({ seed: 100, leases: 100, variety: true })
    const { result, findings, breaches } = await run(agentId, orgs, truth, "af-ZA")

    expect(result.leasesCreated, "all 100 leases import").toBe(100)
    expect(findings.filter((f) => f.silent).map((f) => `row ${f.row} · ${f.field}`), "at scale too").toEqual([])
    expect(breaches.map((b) => `${b.invariant}: ${b.detail}`), "money conservation at 100 rows").toEqual([])
  }, 600_000)
})
