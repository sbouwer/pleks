/**
 * test/db/museum.dbtest.ts — every real file that ever broke the importer, run again, forever
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  The corruption taxonomy covers what we could IMAGINE. It is a good list and it has already found real
 *         bugs — but it is bounded by imagination, and an agency's export is not.
 *
 *         The museum is the other half. Every real file that ever breaks the importer in production gets
 *         anonymised (see the README beside the fixtures) and lands here as a permanent case. The taxonomy
 *         predicts; the museum ACCUMULATES. It costs nothing now and compounds forever.
 *
 *         It is EMPTY today, because the importer has never run in production. That is honest rather than a gap:
 *         an empty museum with a working loader is a museum, and the first real breakage fills it. What matters
 *         is that adding a case requires no code — drop the file in, drop its `.json` beside it, and it runs.
 *         A registry someone has to remember to update is a registry someone forgets to update.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import Papa from "papaparse"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportError } from "@/lib/import/importRunner"

const db = svc()
const MUSEUM = resolve(process.cwd(), "test/db/fixtures/museum")

interface MuseumCase {
  /** One line: what the file did to us. */
  what: string
  /** The mechanism, not the symptom. */
  why: string
  expect: {
    leasesCreated?: number
    /** Fields the report MUST name. A file that broke us must never break us in silence again. */
    mustReport?: string[]
    /** The default and the point: whatever else happens, it may not happen quietly. */
    mustNotBeSilent?: boolean
  }
}

function loadCases(): Array<{ name: string; csv: string; spec: MuseumCase }> {
  if (!existsSync(MUSEUM)) return []
  return readdirSync(MUSEUM)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => {
      const specPath = resolve(MUSEUM, f.replace(/\.csv$/, ".json"))
      if (!existsSync(specPath)) {
        throw new Error(
          `museum: ${f} has no case file. Every fixture needs a .json saying what it did to us and what must ` +
          `happen now — a fixture with no expectation is a file, not a test.`,
        )
      }
      return {
        name: f,
        csv: readFileSync(resolve(MUSEUM, f), "utf8"),
        spec: JSON.parse(readFileSync(specPath, "utf8")) as MuseumCase,
      }
    })
}

const CASES = loadCases()

describe("THE FIXTURE MUSEUM — real files that broke us, run again", () => {
  let agentId: string
  const orgs: string[] = []

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    if (agentId) teardownUser(agentId)
  })

  it("the museum loader works, so a new case needs no code — only a file", () => {
    // The loader is asserted even when the museum is empty. An empty museum is a real state (the importer has
    // never run in production); a BROKEN loader that silently finds nothing looks exactly the same from the
    // outside, and would mean the first real case we add is never actually run.
    expect(() => loadCases()).not.toThrow()
    console.log(`\n── museum: ${CASES.length} case(s) ──\n`)
  })

  it.each(CASES)("$name — $spec.what", async ({ csv, spec }) => {
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true, skipEmptyLines: true, comments: "#",
    })
    const headers = parsed.meta.fields ?? []

    const suggestions = matchColumns(headers)
    const w: Record<string, { field: string; entity: string }> = {}
    for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }

    const result = await runImport(
      parsed.data, toColumnMapping(w),
      toImportDecisions({
        columnMapping: w, expiredLeaseAction: "import_as_expired",
        bankConsentAttested: true, depositsHeldAttested: true,
        fileHeaders: headers,
      }),
      org, agentId, undefined, db,
    )

    const errors = result.errors as ImportError[]

    if (spec.expect.leasesCreated !== undefined) {
      expect(result.leasesCreated, spec.why).toBe(spec.expect.leasesCreated)
    }

    for (const field of spec.expect.mustReport ?? []) {
      expect(
        errors.some((e) => e.field === field),
        `this file once broke us via "${field}", and the report must name it. ${spec.why}`,
      ).toBe(true)
    }

    if (spec.expect.mustNotBeSilent !== false) {
      const rowsIn = parsed.data.length
      const named = new Set(errors.filter((e) => e.rowIndex >= 0).map((e) => e.rowIndex)).size
      expect(
        result.leasesCreated + named + result.skipped,
        "whatever this file does, it may not do it QUIETLY — every row imported, reported, or skipped",
      ).toBeGreaterThanOrEqual(rowsIn)
    }
  }, 180_000)
})
