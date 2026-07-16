/**
 * test/db/import-mri-acceptance.dbtest.ts — THE ACCEPTANCE CEREMONY, on a REAL MRI Rentbook export
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Data:   test/db/fixtures/museum/rptContactsExport*.xlsx — a REAL MRI export (gitignored: real SA IDs + names,
 *         POPIA). Absent in CI, so this suite SKIPS cleanly there (skipIf) and runs only on a machine that has
 *         the local-only museum files. The oracle it reconciles against is museum/ORACLE.md (PII-free).
 *
 * Notes:  import-acceptance.dbtest.ts proves the front door survives a book we DESIGNED to be nasty. This runs a
 *         book we did NOT design — a real agency's actual MRI Rentbook CONTACTS export — and what it proves is the
 *         opposite of a happy path: an MRI contacts export is an IDENTITY MASTER, not a rent roll, and the
 *         lease-first importer therefore CANNOT build a portfolio from it. The value is that it refuses LOUDLY —
 *         every missing lease field named by row — rather than importing half a portfolio in silence. That is the
 *         empirical case for the multi-report adapter (join rptContactsExport → rptAdmRentbookBillingDetail by LEA
 *         reference, multi-tab read for the second property) — tracked in OUTSTANDING, not built here.
 *
 *         ⚠ WHAT THIS DOES NOT PROVE — earned by PROBE-FIRES, and worth recording. An earlier version asserted the
 *         identity dedup collapse (the two Farao rows → one person on id_number_hash). Disabling the matcher
 *         ENTIRELY left the result byte-identical — so that assertion was FALSE PROOF. On a contacts-only file
 *         every row folds into one phantom "(unnamed property)" lease, and the co-tenant / joint-name ("Donovan &
 *         Apphia") row handling collapses the duplicate BEFORE the identity matcher is ever the deciding factor.
 *         Identity dedup is proven where it CAN be isolated — import-identity.dbtest.ts, synthesised multi-lease
 *         rows. It cannot be isolated here, so this suite does not claim it.
 *
 *         So the honest, probe-able claims below are exactly three: (1) the file is refused loudly, every missing
 *         lease field named; (2) vendor + agent rows route correctly (no email gate); (3) the one SA ID that did
 *         land is encrypted at rest. See museum/ORACLE.md for the PII-free reconciliation oracle + findings.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import * as XLSX from "xlsx"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportResult } from "@/lib/import/importRunner"

const db = svc()
const MUSEUM = resolve(process.cwd(), "test/db/fixtures/museum")

/** The real MRI contacts export, tolerant of the "(1)" suffix a browser download adds. */
function contactsFile(): string | null {
  if (!existsSync(MUSEUM)) return null
  const f = readdirSync(MUSEUM).find((n) => /^rptContactsExport.*\.xlsx$/i.test(n))
  return f ? resolve(MUSEUM, f) : null
}
const CONTACTS = contactsFile()
const PRESENT = CONTACTS !== null

/**
 * Read an MRI sheet into row objects. MRI decorates its exports the way a human report does — a blank leading
 * spacer column, and title/blank rows above the real header. This is exactly what Step0Upload's reader has to
 * survive on a real file, so the normalisation lives here, not in a hand-cleaned fixture.
 */
function readMri(file: string): { headers: string[]; rows: Record<string, string>[] } {
  const wb = XLSX.read(new Uint8Array(readFileSync(file)), { type: "array" })
  const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1, defval: "", raw: false,
  })
  // Header row = the first row with more than two non-empty cells (title rows have one).
  const hdrIdx = grid.findIndex((r) => r.filter((c) => String(c).trim() !== "").length > 2)
  const rawHeaders = grid[hdrIdx].map((c) => String(c).trim())
  const firstReal = rawHeaders.findIndex((c) => c !== "") // drop the blank leading spacer column
  const headers = rawHeaders.slice(firstReal)
  const rows = grid
    .slice(hdrIdx + 1)
    .map((r) => r.slice(firstReal))
    .filter((r) => r.some((c) => String(c).trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? "")])))
  return { headers, rows }
}

async function importRows(orgId: string, agentId: string, rows: Record<string, string>[]): Promise<ImportResult> {
  const suggestions = matchColumns(Object.keys(rows[0]))
  const w: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }
  const decisions = toImportDecisions({ columnMapping: w, expiredLeaseAction: "skip" })
  return runImport(rows, toColumnMapping(w), decisions, orgId, agentId, undefined, db)
}

/** Count contacts of one primary_role in an org. */
async function countRole(orgId: string, role: string): Promise<number> {
  const { count, error } = await db
    .from("contacts").select("id", { count: "exact", head: true })
    .eq("org_id", orgId).eq("primary_role", role)
  if (error) throw new Error(error.message)
  return count ?? 0
}

describe.skipIf(!PRESENT)("MRI ACCEPTANCE — a real Rentbook contacts export through the real front door", () => {
  let agentId: string
  let orgId: string
  let result: ImportResult
  const rows = PRESENT ? readMri(CONTACTS!).rows : []

  beforeAll(async () => {
    if (!PRESENT) return
    agentId = seedUser()
    orgId = await seedEmptyOrg(db)
    result = await importRows(orgId, agentId, rows)
  }, 120_000)

  afterAll(() => {
    if (orgId) teardownOrg(orgId)
    if (agentId) teardownUser(agentId)
  })

  it("REFUSED LOUDLY, not silently: a contacts-only file names every missing lease field", () => {
    // The core claim. This is NOT a rent roll — it is the identity master — so the lease-first importer CANNOT
    // build leases from it. The acceptance criterion is that it says so BY ROW AND FIELD rather than importing
    // half a portfolio in silence. Probe-fires: if `property_name` were not required, that error vanishes and
    // this assertion FAILS — it can produce the failure it exists to catch.
    const fields = new Set(result.errors.map((e) => e.field))
    expect(fields.has("property_name"), "no property on an identity row → named, not guessed").toBe(true)
    expect(fields.has("email"), "an email-less legacy party → named, not dropped in silence").toBe(true)
    expect(result.errors.length, "a contacts-only file cannot import clean — it is not a rent roll").toBeGreaterThan(0)
    expect(result.errors.every((e) => e.message.length > 0), "no blank/silent error").toBe(true)
  })

  it("VENDORS + AGENT route correctly off the MRI TYPE column (no email gate on either)", async () => {
    // What DOES land: entities the lease layer does not gate. Probe-fires: break TYPE routing and these counts move.
    expect(await countRole(orgId, "contractor"), "two suppliers/vendors").toBe(2)
    expect(result.agentInvitesSent, "one agent → one invite").toBe(1)
  })

  it("PII: any SA ID that landed is ENCRYPTED at rest and carries its lookup hash", async () => {
    const { data, error } = await db
      .from("contacts").select("id_number, id_number_hash")
      .eq("org_id", orgId).not("id_number", "is", null)
    if (error) throw new Error(error.message)
    expect(data!.length, "at least the one captured SA ID landed").toBeGreaterThanOrEqual(1)
    for (const c of data!) {
      expect(c.id_number, "ciphertext iv:ct:tag, never raw").toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/i)
      expect(c.id_number_hash, "the deterministic match key is present").toBeTruthy()
    }
  })
})

if (!PRESENT) {
  // Honest, not silent: say WHY zero MRI cases ran, so a green CI is not mistaken for a green ceremony.
  console.log("\n── MRI acceptance: SKIPPED (no local museum export; gitignored for POPIA) ──\n")
}
