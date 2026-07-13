/**
 * test/db/import-density.dbtest.ts — half the file is garbage. Does the REPORT stay honest?
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Poison corrupts ONE value at a time, which answers "is this validator present?". It cannot answer the
 *         question an agency's real file asks, which is:
 *
 *             when 50% of the book is wrong, does the report still ACCOUNT FOR EVERY ROW?
 *
 *         Those are different failure modes. A validator can be perfect per-row while the run lies in
 *         aggregate — a row counted in two buckets, a row counted in none, a summary that says 400 imported
 *         when 380 landed. And an agency cannot detect that: they see "400 imported", they believe it, and the
 *         twenty missing leases surface months later as twenty tenants who were never invoiced.
 *
 *         THE INVARIANT, at every density:
 *
 *             imported + flagged + rejected = rows in the file.   Nothing vanishes, nothing is double-counted.
 *
 *         The corruptions are TAGGED (test/import/corrupt.ts): each one carries what it expects to happen, so a
 *         row that was corrupted and then silently imported CLEAN is itself a finding — the file said something
 *         false and we agreed with it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportError } from "@/lib/import/importRunner"
import { generateBook } from "@/test/import/book"
import { render } from "@/test/import/dialect"
import { corrupt, VALUE_CORRUPTIONS, type CorruptedBook } from "@/test/import/corrupt"

const db = svc()

async function importCorrupted(orgId: string, agentId: string, book: CorruptedBook) {
  const suggestions = matchColumns(book.headers)
  const w: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }

  return runImport(
    book.rows, toColumnMapping(w),
    toImportDecisions({
      columnMapping: w, expiredLeaseAction: "import_as_expired",
      bankConsentAttested: true, depositsHeldAttested: true,
    }),
    orgId, agentId, undefined, db,
  )
}

describe("DENSITY — the report must stay truthful when the file is half garbage", () => {
  let agentId: string
  const orgs: string[] = []

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  it("at 10%, 50% and 100% corruption, every row is still ACCOUNTED FOR", async () => {
    const failures: string[] = []
    const table: string[] = []

    for (const density of [0.1, 0.5, 1.0]) {
      const truth = generateBook({ seed: 501, leases: 20, variety: true })
      const clean = render(truth, "en-ZA")
      const book = corrupt(clean, density, 501, VALUE_CORRUPTIONS)

      // PROVE THE PROBE FIRES. If nothing was actually corrupted, every assertion below passes vacuously — the
      // test would be reporting the health of the corrupter, not of the importer.
      expect(
        book.corrupted.size,
        `density ${density} corrupted NO rows — the assertions below would prove nothing`,
      ).toBeGreaterThan(0)

      const org = await seedEmptyOrg(db)
      orgs.push(org)
      const result = await importCorrupted(org, agentId, book)

      const rowsInFile = book.rows.length
      const errors = result.errors as ImportError[]

      // A row is accounted for if it LANDED, or if the report NAMES it. Those are the only two honest outcomes.
      const named = new Set(errors.filter((e) => e.rowIndex >= 0).map((e) => e.rowIndex))
      const landed = result.leasesCreated
      const accounted = landed + named.size

      const unaccounted = rowsInFile - accounted
      table.push(
        `  ${String(Math.round(density * 100)).padStart(3)}% corrupt · ${rowsInFile} rows → ` +
        `${landed} imported · ${named.size} reported · ${unaccounted} UNACCOUNTED FOR`,
      )

      if (unaccounted > 0) {
        const silent = book.rows.map((_, i) => i).filter((i) => !named.has(i))
        failures.push(
          `at ${Math.round(density * 100)}% corruption: ${rowsInFile} rows in the file, ${landed} imported and ` +
          `${named.size} reported — ${unaccounted} row(s) are in NEITHER bucket. Rows with no message at all: ` +
          `[${silent.slice(0, 10).join(", ")}]. The agency is told a number that is not true.`,
        )
      }

      // A row we DELIBERATELY corrupted must never import in silence. If it landed and nothing was said, the
      // file told us something false and we wrote it down.
      for (const [rowIndex, c] of book.corrupted) {
        if (c.expect === "imported") continue
        if (!named.has(rowIndex)) {
          failures.push(
            `row ${rowIndex} was corrupted (${c.id}: ${c.why}) and the report says NOTHING about it ` +
            `(density ${Math.round(density * 100)}%)`,
          )
        }
      }
    }

    console.log(`\n── corruption density ──\n${table.join("\n")}\n`)
    expect(failures, "imported + reported must account for every row in the file, at any density").toEqual([])
  }, 600_000)

  it("a 100%-corrupt file imports NOTHING and says so — it does not report success over an empty database", async () => {
    // The degenerate case, and the one most likely to be handled by accident. A file where every row is
    // incoherent must produce zero leases AND a report that says zero — never "0 errors, all done".
    const truth = generateBook({ seed: 502, leases: 8 })
    const clean = render(truth, "en-ZA")
    const book = corrupt(clean, 1.0, 502, [VALUE_CORRUPTIONS[0]])   // every row: negative rent

    const org = await seedEmptyOrg(db)
    orgs.push(org)
    const result = await importCorrupted(org, agentId, book)

    expect(result.leasesCreated, "not one lease may be created from a file of negative rents").toBe(0)

    const refusals = (result.errors as ImportError[]).filter((e) => e.severity === "error" && e.rowIndex >= 0)
    expect(
      new Set(refusals.map((e) => e.rowIndex)).size,
      "every one of the eight rows must be refused BY NAME — a silent empty import is the worst outcome " +
      "available, because the agency has no way to tell it apart from a book that had nothing in it",
    ).toBe(8)

    const { count, error } = await db
      .from("leases").select("id", { count: "exact", head: true }).eq("org_id", org)
    expect(error).toBeFalsy()
    expect(count, "and the database must actually be empty").toBe(0)
  }, 300_000)

  it("the clean rows in a half-corrupt file still land — strictness costs the ROW, never the BOOK", async () => {
    // The other half of the doctrine. A book that is 50% garbage must still deliver its good half; an importer
    // that refuses the whole file because ten rows are bad has made its strictness the agency's problem.
    const truth = generateBook({ seed: 503, leases: 20, variety: true })
    const clean = render(truth, "en-ZA")
    const book = corrupt(clean, 0.5, 503, VALUE_CORRUPTIONS)

    const org = await seedEmptyOrg(db)
    orgs.push(org)
    await importCorrupted(org, agentId, book)

    // Rows we did NOT corrupt, and rows whose corruption is only worth a FLAG, must all import.
    const mustLand = book.rows
      .map((_, i) => i)
      .filter((i) => {
        const c = book.corrupted.get(i)
        return !c || c.expect === "flagged"
      })

    // Name the rows that went missing. A bare count assertion tells you a lease is gone but not WHICH — and
    // "14 != 15" is not a bug report, it is a puzzle. The unit number is the join key that survives the round
    // trip without being re-derived by the code under test.
    const { data: landed, error } = await db
      .from("leases").select("units!inner(unit_number)").eq("org_id", org)
    expect(error).toBeFalsy()
    const landedUnits = new Set(
      (landed ?? []).map((l) => {
        const u = l.units as unknown as { unit_number: string } | { unit_number: string }[]
        return Array.isArray(u) ? u[0]?.unit_number : u?.unit_number
      }),
    )

    const missing = mustLand
      .map((i) => ({ row: i, unit: String(i + 1), corruption: book.corrupted.get(i)?.id ?? "(clean)" }))
      .filter((x) => !landedUnits.has(x.unit))

    expect(
      missing.map((m) => `row ${m.row} (unit ${m.unit}, ${m.corruption}) did not import`),
      "a clean row — or one whose fault is only worth a FLAG — must land. Strictness costs the ROW, never the BOOK.",
    ).toEqual([])
  }, 300_000)
})
