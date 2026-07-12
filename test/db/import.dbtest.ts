/**
 * test/db/import.dbtest.ts — the bulk importer against a REAL Postgres (the schema is the missing test)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Data:   seeds an EMPTY org, runs runImport() over a realistic af-ZA agency book, asserts what actually
 *         landed in properties/units/tenants/leases — then re-runs the identical import and asserts a no-op.
 * Notes:  This tier exists because EVERY import defect so far was invisible to source-level review. The
 *         runner builds its inserts as plain objects, so a column that is NOT NULL in the schema but absent
 *         (or explicitly null) in the object fails at Postgres — never at the type checker, and the failure
 *         was swallowed into a generic "Failed to create X". F-1 (#201) fixed leases.tenant_id that way and
 *         the very next NOT NULL column (property_id) silently took its place. Only a real INSERT proves it.
 *
 *         Pinned here: property/unit/lease actually CREATE (property_id, start_date, rent, escalation_percent
 *         all satisfied); F-7 "Retail" → commercial, not the old residential default; F-7 unrecognised type
 *         REFUSES the row rather than defaulting it; F-8 a cents-denominated header is not ×100'd again;
 *         F-6 the whole import is idempotent on re-run.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { runImport, type ColumnMapping, type ImportDecisions, type ImportResult } from "@/lib/import/importRunner"

const db = svc()

// The mapping the wizard would produce. NOTE the rent header: `monthly_rent_cents` is a Pleks-shaped
// re-export — the value is ALREADY integer cents (F-8).
const COLUMNS: Array<[column: string, field: string, entity: string]> = [
  ["Property", "property_name", "unit"],
  ["Address", "address", "unit"],
  ["City", "city", "unit"],
  ["Province", "province", "unit"],
  ["Unit", "unit_number", "unit"],
  ["First Name", "first_name", "tenant"],
  ["Last Name", "last_name", "tenant"],
  ["Email", "email", "tenant"],
  ["Lease Start", "lease_start", "lease"],
  ["Lease End", "lease_end", "lease"],
  ["monthly_rent_cents", "rent_amount_cents", "lease"],
  ["Lease Type", "lease_type", "lease"],
]

const mapping: ColumnMapping = Object.fromEntries(
  COLUMNS.map(([column, field, entity]) => [column, { column, field, entity }]),
)

const decisions: ImportDecisions = { conflicts: [], expiredLeases: "import_all", skipRows: [] }

/** A realistic af-ZA book: an abbreviated province, a commercial lease, joint tenants, and one bad cell. */
const ROWS: Record<string, string>[] = [
  {
    // R6 600,00 exported as 660000 CENTS by a Pleks-shaped re-export. "Retail" is a COMMERCIAL lease.
    Property: "Acacia Court", Address: "12 Acacia Rd", City: "Cape Town", Province: "WC", Unit: "1",
    "First Name": "Thabo", "Last Name": "Nkosi", Email: "thabo@example.co.za",
    "Lease Start": "01/03/2026", "Lease End": "28/02/2027",
    monthly_rent_cents: "660000", "Lease Type": "Retail",
  },
  {
    // Joint tenants: one row, two people, two emails.
    Property: "Acacia Court", Address: "12 Acacia Rd", City: "Cape Town", Province: "WC", Unit: "2",
    "First Name": "Donovan & Apphia", "Last Name": "Meyer", Email: "donovan@example.co.za, apphia@example.co.za",
    "Lease Start": "01/04/2026", "Lease End": "31/03/2027",
    monthly_rent_cents: "850000", "Lease Type": "Residential",
  },
  {
    // An unclassifiable lease type. It must REFUSE the lease, not quietly file it as residential.
    Property: "Acacia Court", Address: "12 Acacia Rd", City: "Cape Town", Province: "WC", Unit: "3",
    "First Name": "Lerato", "Last Name": "Dlamini", Email: "lerato@example.co.za",
    "Lease Start": "01/05/2026", "Lease End": "30/04/2027",
    monthly_rent_cents: "700000", "Lease Type": "Mixed Use",
  },
]

interface LeaseRow {
  id: string; unit_id: string; property_id: string | null; tenant_id: string
  rent_amount_cents: number; lease_type: string; escalation_percent: string | number
  start_date: string; end_date: string | null; status: string
}

async function leasesOf(orgId: string): Promise<LeaseRow[]> {
  const { data, error } = await db
    .from("leases")
    .select("id, unit_id, property_id, tenant_id, rent_amount_cents, lease_type, escalation_percent, start_date, end_date, status")
    .eq("org_id", orgId)
  if (error) throw new Error(`leasesOf: ${error.message}`)
  return (data ?? []) as LeaseRow[]
}

async function countOf(table: string, orgId: string): Promise<number> {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId)
  if (error) throw new Error(`countOf ${table}: ${error.message}`)
  return count ?? 0
}

describe("bulk import — against the real schema", () => {
  let orgId: string
  let agentId: string
  let first: ImportResult

  beforeAll(async () => {
    orgId = await seedEmptyOrg(db)
    agentId = seedUser()
    first = await runImport(ROWS, mapping, decisions, orgId, agentId, undefined, db)
  })

  afterAll(() => {
    teardownOrg(orgId)
    teardownUser(agentId)
  })

  // ── The pipeline actually works (it did not before: property_id / escalation_percent / NOT NULL columns) ──

  it("creates the property, its units, and the leases — the whole chain, not just contacts", async () => {
    expect(first.propertiesCreated, "one property (address/city/province all satisfied)").toBe(1)
    expect(first.unitsCreated, "three units").toBe(3)

    // Two leases: rows 1 and 2. Row 3's lease type is unclassifiable → refused (asserted below).
    expect(first.leasesCreated, "two leases created").toBe(2)
    expect(await countOf("leases", orgId)).toBe(2)
  })

  it("every lease carries property_id — the NOT NULL column nothing derives from unit_id", async () => {
    const leases = await leasesOf(orgId)
    expect(leases).toHaveLength(2)
    for (const l of leases) {
      // This is the bug that outlived F-1: tenant_id got set, property_id did not, and the insert still 23502'd.
      expect(l.property_id, "leases.property_id must be populated").toBeTruthy()
      expect(l.start_date).toBeTruthy()
      expect(Number(l.escalation_percent), "NOT NULL DEFAULT 10.00 applies when unmapped").toBe(10)
    }
  })

  // ── F-8: a cents-denominated header must not be ×100'd again ──

  it("F-8: `monthly_rent_cents` is read AS cents — not inflated 100×", async () => {
    const leases = await leasesOf(orgId)
    const rents = leases.map((l) => l.rent_amount_cents).sort((a, b) => a - b)
    // R6 600 and R8 500. The old parser read "660000" as R660 000 and stored 66 000 000.
    expect(rents).toEqual([660_000, 850_000])
    expect(rents).not.toContain(66_000_000)
  })

  // ── F-7: classify, never guess ──

  it("F-7: a \"Retail\" lease is COMMERCIAL — not the old silent residential default", async () => {
    const leases = await leasesOf(orgId)
    const retail = leases.find((l) => l.rent_amount_cents === 660_000)
    expect(retail?.lease_type, "Retail must import as commercial").toBe("commercial")
  })

  it("F-7: an unrecognised lease type REFUSES the lease (the DB default would re-instate the guess)", async () => {
    const leases = await leasesOf(orgId)
    // Row 3 (R7 000) must NOT exist — and must certainly not exist as `residential`.
    expect(leases.find((l) => l.rent_amount_cents === 700_000), "the Mixed Use lease must not be imported").toBeUndefined()

    const refusal = first.errors.find((e) => e.severity === "error" && e.field === "lease_type")
    expect(refusal, "the refusal must be reported to the agent").toBeTruthy()
    expect(refusal?.message).toContain("Mixed Use")
  })

  // ── The DB-default traps: a blank cell and an unrecognised boolean both land on a NOT NULL DEFAULT ──

  it("F-7: a BLANK lease type refuses the row — it must not fall through to DEFAULT 'residential'", async () => {
    // The commonest shape of bad data: the column is filled where it "wasn't obvious" and blank elsewhere.
    // Omitting the column hands the row to lease_type NOT NULL DEFAULT 'residential'.
    const org = await seedEmptyOrg(db)
    try {
      const rows: Record<string, string>[] = [{
        Property: "Blank Type Court", Address: "1 Blank Rd", City: "Cape Town", Province: "WC", Unit: "1",
        "First Name": "Ayanda", "Last Name": "Khumalo", Email: "ayanda@example.co.za",
        "Lease Start": "01/03/2026", "Lease End": "28/02/2027",
        monthly_rent_cents: "500000", "Lease Type": "",     // ← blank, column IS mapped
      }]
      const r = await runImport(rows, mapping, decisions, org, agentId, undefined, db)

      expect(r.leasesCreated, "a blank statutory classification must not import").toBe(0)
      expect(await countOf("leases", org), "and certainly not as 'residential'").toBe(0)
      expect(r.errors.some((e) => e.severity === "error" && e.field === "lease_type")).toBe(true)
    } finally {
      teardownOrg(org)
    }
  })

  it("F-7: a Y/N book keeps its CPA protection — an unrecognised boolean must not read as false", async () => {
    // cpa_applies / is_fixed_term are NOT NULL DEFAULT true. The old normaliseBoolean returned false for
    // anything outside {true,yes,1,ja}, so a book exporting Y/N stripped CPA s14 from EVERY lease.
    const org = await seedEmptyOrg(db)
    try {
      const cpaMapping: ColumnMapping = {
        ...mapping,
        "CPA": { column: "CPA", field: "cpa_applies", entity: "lease" },
        "Fixed Term": { column: "Fixed Term", field: "is_fixed_term", entity: "lease" },
      }
      const rows: Record<string, string>[] = [{
        Property: "Yebo Court", Address: "2 Yebo Rd", City: "Cape Town", Province: "WC", Unit: "1",
        "First Name": "Nomsa", "Last Name": "Mbeki", Email: "nomsa@example.co.za",
        "Lease Start": "01/03/2026", "Lease End": "28/02/2027",
        monthly_rent_cents: "600000", "Lease Type": "Residential",
        CPA: "Y", "Fixed Term": "Y",
      }]
      const r = await runImport(rows, cpaMapping, decisions, org, agentId, undefined, db)
      expect(r.leasesCreated).toBe(1)

      const { data, error } = await db
        .from("leases").select("cpa_applies, is_fixed_term").eq("org_id", org).single()
      expect(error).toBeFalsy()
      expect(data?.cpa_applies, "\"Y\" must mean the CPA APPLIES").toBe(true)
      expect(data?.is_fixed_term, "\"Y\" must mean fixed-term").toBe(true)
    } finally {
      teardownOrg(org)
    }
  })

  // ── Joint tenants (F-1/F-6 shape) ──

  it("a joint-tenant row creates BOTH people and still creates the lease", async () => {
    const { data: contacts, error } = await db
      .from("contacts").select("primary_email").eq("org_id", orgId)
    expect(error).toBeFalsy()
    const emails = (contacts ?? []).map((c) => c.primary_email)
    expect(emails).toContain("donovan@example.co.za")
    expect(emails).toContain("apphia@example.co.za")

    const leases = await leasesOf(orgId)
    expect(leases.find((l) => l.rent_amount_cents === 850_000), "the joint-tenant lease exists").toBeTruthy()
  })

  // ── F-6: idempotency — the whole point of a migration front door ──

  it("F-6: a BLANK unit number does not duplicate the unit (and its lease) on re-run", async () => {
    // A freestanding house — the commonest SA residential letting — has no unit number. The lookup used the
    // raw value (ILIKE '') while the insert wrote "1", so every re-run made a SECOND unit with a new unit_id,
    // which the lease dedup (keyed on unit_id) then missed → a second active lease for the same tenant.
    // Re-running is the documented remedy for a rejected row, so this fired in the normal workflow.
    const org = await seedEmptyOrg(db)
    try {
      const houseRows: Record<string, string>[] = [{
        Property: "14 Protea Street", Address: "14 Protea St", City: "Durban", Province: "KZN", Unit: "",
        "First Name": "Sipho", "Last Name": "Zulu", Email: "sipho@example.co.za",
        "Lease Start": "01/02/2026", "Lease End": "31/01/2027",
        monthly_rent_cents: "900000", "Lease Type": "Residential",
      }]

      const r1 = await runImport(houseRows, mapping, decisions, org, agentId, undefined, db)
      expect(r1.unitsCreated, "the house imports as one unit").toBe(1)
      expect(r1.leasesCreated, "with one lease").toBe(1)

      const r2 = await runImport(houseRows, mapping, decisions, org, agentId, undefined, db)
      expect(r2.unitsCreated, "re-run must not create a second unit").toBe(0)
      expect(r2.leasesCreated, "re-run must not create a second lease").toBe(0)

      expect(await countOf("units", org), "still exactly one unit").toBe(1)
      expect(await countOf("leases", org), "still exactly one lease — no duplicate tenancy").toBe(1)
    } finally {
      teardownOrg(org)
    }
  })

  it("F-6: re-running the identical import is a NO-OP (no duplicate leases, units, or tenants)", async () => {
    const before = {
      properties: await countOf("properties", orgId),
      units: await countOf("units", orgId),
      tenants: await countOf("tenants", orgId),
      leases: await countOf("leases", orgId),
    }

    const second = await runImport(ROWS, mapping, decisions, orgId, agentId, undefined, db)

    expect(second.propertiesCreated, "no second property").toBe(0)
    expect(second.unitsCreated, "no second unit").toBe(0)
    expect(second.leasesCreated, "no second lease — the F-6b dedup holds").toBe(0)

    expect(await countOf("properties", orgId)).toBe(before.properties)
    expect(await countOf("units", orgId)).toBe(before.units)
    expect(await countOf("tenants", orgId)).toBe(before.tenants)
    expect(await countOf("leases", orgId)).toBe(before.leases)
  })
})
