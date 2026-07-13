/**
 * test/db/import-poison.dbtest.ts — POISON: feed one deliberately WRONG value at a time
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  The ablation harness (import-ablation.dbtest.ts) removes a field and asks
 *             "what does the system INVENT when I say nothing?"
 *         This one keeps every field and corrupts ONE, and asks the other half of the question:
 *             "what does the system ACCEPT when I lie?"
 *
 *         Absence tests the DEFAULTS. A wrong value tests the VALIDATORS. They are different failure modes and
 *         a system can pass one while failing the other — the importer did.
 *
 *         THE INVARIANT:
 *
 *             A wrong value must be REFUSED (the row does not import) or FLAGGED (the agent is told).
 *             It must NEVER be silently accepted, silently coerced, or silently dropped.
 *
 *         So the test is mechanical: poison a field; if the import produces neither an error nor a warning
 *         naming it, that is a finding — whatever landed in the database, the agency was not told.
 *
 *         "Silently accepted" is the worst of the three, because the data looks fine: a negative rent, a lease
 *         that ends before it starts, an R0 rent. Nothing in the UI screams. The ledger just quietly disagrees
 *         with reality.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportError } from "@/lib/import/importRunner"
import { saTodayISO, addCalendarMonths } from "@/lib/dates"

const db = svc()

function dmy(months: number): string {
  const [y, m, d] = addCalendarMonths(saTodayISO(), months).split("-")
  return `${d}/${m}/${y}`
}

/** A book that imports perfectly. The control. */
const BOOK: Record<string, string> = {
  "Property Name": "Poison Court",
  "Address": "1 Poison Rd",
  "City": "Cape Town",
  "Province": "WC",
  "Unit Number": "1",
  "First Name": "Thabo",
  "Surname": "Nkosi",
  "Email": "thabo@example.co.za",
  "Cell": "0821234567",
  "ID Number": "9202204720082",
  "Lease Start": dmy(-8),
  "Lease End": dmy(+4),
  "Monthly Rent": "6 600,50",
  "Deposit": "13 201,00",
  "Lease Type": "Residential",
  "Escalation Type": "CPI",
  "Escalation %": "7,5",
  "Notice Period Days": "20",
  "Payment Due Day": "1",
}

const HEADERS = Object.keys(BOOK)

/** Each poison is a lie an agency's export really does contain. */
const POISONS: Array<{ field: string; value: string; why: string }> = [
  // Money — the values that quietly corrupt a ledger
  { field: "Monthly Rent", value: "-6600.50", why: "a NEGATIVE rent" },
  { field: "Monthly Rent", value: "0", why: "a ZERO rent — a lease that bills nothing" },
  { field: "Monthly Rent", value: "N/A", why: "not a number at all" },
  { field: "Deposit", value: "-13201", why: "a NEGATIVE deposit (money owed BY the agency)" },
  { field: "Escalation %", value: "9999", why: "overflows numeric(5,2)" },
  { field: "Escalation %", value: "-5", why: "a negative escalation (rent that falls)" },

  // Dates — the values that corrupt a statutory clock
  { field: "Lease Start", value: "45/13/2026", why: "not a real calendar day" },
  { field: "Lease End", value: dmy(-24), why: "the lease ENDS BEFORE IT STARTS" },

  // Enums / domains — CHECK-constrained, so a wrong value is a hard Postgres reject
  { field: "Province", value: "Transvaal", why: "not one of the nine provinces (abolished in 1994)" },
  { field: "Lease Type", value: "Sectional Title", why: "a TENURE, not a use" },
  { field: "Escalation Type", value: "Market related", why: "not an escalation basis Pleks knows" },
  { field: "Payment Due Day", value: "31", why: "outside the 1-28 domain" },
  { field: "Notice Period Days", value: "-5", why: "a negative notice period" },

  // BOUNDS — values that are perfectly type-valid and utterly absurd. These are the ones a type system, a
  // CHECK constraint and a column width all wave straight through. "It parses" is not "it could be true".
  { field: "Escalation %", value: "500", why: "a 500% annual escalation — type-valid, absurd" },
  { field: "Monthly Rent", value: "9 999 999,00", why: "R10m a month — almost always a units error" },
  { field: "Deposit", value: "660 050,00", why: "a deposit 100x the monthly rent" },
  { field: "Notice Period Days", value: "3650", why: "a ten-year notice period" },

  // Identity — the values that poison dedup and comms
  { field: "Email", value: "not-an-email", why: "not an email address" },
  { field: "ID Number", value: "1234567890123", why: "13 digits, but fails the SA ID checksum" },
]

type Outcome = "REFUSED" | "FLAGGED" | "SILENT"

async function poisonRun(
  orgId: string, agentId: string, field: string, value: string,
): Promise<{ outcome: Outcome; landed: Record<string, unknown> | null }> {
  const suggestions = matchColumns(HEADERS)
  const wire: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) wire[s.column] = { field: s.field, entity: s.entity }

  const decisions = toImportDecisions({ columnMapping: wire, expiredLeaseAction: "import_as_expired" })
  const row = { ...BOOK, [field]: value }

  const result = await runImport([row], toColumnMapping(wire), decisions, orgId, agentId, undefined, db)

  const { data: lease, error } = await db
    .from("leases")
    .select("rent_amount_cents, deposit_amount_cents, escalation_percent, start_date, end_date, notice_period_days, payment_due_day, lease_type")
    .eq("org_id", orgId).maybeSingle()
  if (error) throw new Error(`poison read-back: ${error.message}`)

  const errors = result.errors as ImportError[]
  const refused = !lease && errors.some((e) => e.severity === "error")
  if (refused) return { outcome: "REFUSED", landed: null }

  // Did any message name the POISONED FIELD? Match on the Pleks field the header maps to — the errors speak
  // in field names (`rent_amount_cents`), not header names ("Monthly Rent"). An earlier version compared the
  // header and under-detected: a flag WAS raised for an implausible rent and the harness reported it SILENT.
  // A detector that cannot see the signal it is looking for is worse than no detector.
  const poisonedField = wire[field]?.field ?? field
  const told = errors.some((e) =>
    e.field === poisonedField || e.message.toLowerCase().includes(value.toLowerCase().slice(0, 8)),
  )

  if (told) return { outcome: "FLAGGED", landed: (lease ?? null) as Record<string, unknown> | null }
  return { outcome: "SILENT", landed: (lease ?? null) as Record<string, unknown> | null }
}

describe("POISON — one deliberately wrong value at a time", () => {
  let agentId: string
  const orgs: string[] = []
  const silent: string[] = []

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  it("every wrong value is REFUSED or FLAGGED — never silently swallowed", async () => {
    const table: string[] = []

    for (const p of POISONS) {
      const org = await seedEmptyOrg(db)
      orgs.push(org)

      const { outcome, landed } = await poisonRun(org, agentId, p.field, p.value)
      table.push(`  ${outcome.padEnd(8)} ${p.field} = ${JSON.stringify(p.value).padEnd(14)} (${p.why})` +
        (outcome === "SILENT" && landed ? `\n             ↳ LANDED: ${JSON.stringify(landed)}` : ""))

      if (outcome === "SILENT") silent.push(`${p.field}=${p.value} (${p.why})`)
    }

    console.log(
      `\n── poison: ${POISONS.length} deliberately wrong values ──\n` +
      table.join("\n") +
      `\n\n  ${silent.length} SILENTLY ACCEPTED — a lie the agency was never told about\n`,
    )

    expect(silent, "a wrong value must be refused or flagged — never silently accepted").toEqual([])
  }, 300_000)

  // ── ISOLATION. The strictness must cost the agency the ROW, never the BOOK. ───────────────────────

  it("a poisoned row does NOT take the book down — 5 leases, 1 rotten, 4 import", async () => {
    // A book of 5 000 leases cannot hang on two mistyped digits. If our own validation made the import
    // all-or-nothing, the strictness would stop being a service to the agency and become their problem.
    // Refusal is PER ROW. The rest of the book lands.
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const rows = [1, 2, 3, 4, 5].map((n) => ({
      ...BOOK,
      "Unit Number": String(n),
      "Email": `tenant${n}@example.co.za`,
      // Row 3 is rotten: a negative rent. It is INCOHERENT, so it is refused — and only it.
      "Monthly Rent": n === 3 ? "-6600.50" : "6 600,50",
    }))

    const suggestions = matchColumns(HEADERS)
    const wire: Record<string, { field: string; entity: string }> = {}
    for (const s of suggestions) if (s.field) wire[s.column] = { field: s.field, entity: s.entity }

    const result = await runImport(
      rows, toColumnMapping(wire),
      toImportDecisions({ columnMapping: wire, expiredLeaseAction: "import_as_expired" }),
      org, agentId, undefined, db,
    )

    expect(result.leasesCreated, "the four good leases import").toBe(4)

    const refusal = (result.errors as ImportError[]).find((e) => e.severity === "error")
    expect(refusal, "the rotten row is refused, by name").toBeTruthy()
    expect(refusal!.rowIndex, "…and points AT ROW 3, so the agent can fix that one line").toBe(2)

    const { count, error } = await db
      .from("leases").select("id", { count: "exact", head: true }).eq("org_id", org)
    expect(error).toBeFalsy()
    expect(count, "four leases on the ledger, not zero").toBe(4)
  }, 120_000)

  it("a bad ID is IMPORTED and marked known-wrong — the agency does not lose the tenant", async () => {
    // Stéan's ruling: flag it, import it, and let the agent correct it the moment they touch the lease. The
    // mark is PERSISTED on contacts.tags — an import warning is read once and gone; a tag is a worklist.
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const suggestions = matchColumns(HEADERS)
    const wire: Record<string, { field: string; entity: string }> = {}
    for (const s of suggestions) if (s.field) wire[s.column] = { field: s.field, entity: s.entity }

    const result = await runImport(
      [{ ...BOOK, "ID Number": "1234567890123" }], toColumnMapping(wire),
      toImportDecisions({ columnMapping: wire, expiredLeaseAction: "import_as_expired" }),
      org, agentId, undefined, db,
    )

    expect(result.leasesCreated, "the lease still imports — a mistyped digit is not worth a lost lease").toBe(1)

    const { data: contact, error } = await db
      .from("contacts").select("tags, is_verified").eq("org_id", org).eq("primary_role", "tenant").single()
    expect(error).toBeFalsy()
    expect(contact?.tags, "…but the contact is marked, queryably, as known-wrong").toContain("id_checksum_failed")
    expect(contact?.is_verified, "and is not treated as a verified identity").toBe(false)
  }, 120_000)
})
