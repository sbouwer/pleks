/**
 * test/db/import-completeness.dbtest.ts — import lands incomplete-and-FLAGGED, never refused (ADDENDUM_21E §5/§7)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  The policy's mark half: a property imported with only a NAME (the real MRI case) LANDS — flagged with
 *         `incomplete_mandatory = [address_line1, city, province]` — instead of being refused; an email-less tenant
 *         lands flagged `[primary_email]` (the email-relax, §7, now a persisted burn-down item, not just a transient
 *         warning). A COMPLETE record carries a NULL flag. The registry (§4) is the only writer.
 *
 *         ⚠ PROBE-FIRES: the "property lands despite no address" assertion was verified FAILING against the
 *         pre-relax importer, which REFUSED the property (returned null, no row) — so a green here is the relax
 *         working, not a vacuous pass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport } from "@/lib/import/importRunner"
import { checkLeasePrerequisites } from "@/lib/leases/checkPrerequisites"

const db = svc()

const HEADERS = [
  "Property", "Address", "City", "Province", "Unit",
  "First Name", "Surname", "Email", "Cell", "Lease Start", "Lease End", "Monthly Rent",
] as const

function row(o: Partial<Record<(typeof HEADERS)[number], string>>): Record<string, string> {
  return Object.fromEntries(HEADERS.map((h) => [h, o[h] ?? ""])) as Record<string, string>
}

async function importRows(orgId: string, agentId: string, rows: Record<string, string>[]) {
  const suggestions = matchColumns([...HEADERS])
  const w: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }
  return runImport(rows, toColumnMapping(w), toImportDecisions({ columnMapping: w, expiredLeaseAction: "skip" }), orgId, agentId, undefined, db)
}

describe("IMPORT COMPLETENESS — records land flagged, never refused (21E §5/§7)", () => {
  let agentId: string
  let orgId: string

  const INCOMPLETE = row({
    Property: "Twin Peaks", Unit: "1", "First Name": "Nomsa", Surname: "Dlamini", Cell: "0821112222",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "8860",
    // deliberately NO Address/City/Province, NO Email
  })
  const COMPLETE = row({
    Property: "Complete House", Address: "1 Main Rd", City: "Cape Town", Province: "Western Cape", Unit: "1",
    "First Name": "Full", Surname: "Person", Email: "full@x.co.za", Cell: "0829998888",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "9000",
  })
  // A joint tenancy: two emails (triggers the co-tenant split) but ONE phone — the second half (Apphia) lands
  // with no phone. This is the insertSingleTenant path the census found relaxed-but-UNTRACKED; it must now flag.
  const JOINT = row({
    Property: "Joint House", Address: "2 Oak Ave", City: "Durban", Province: "KwaZulu-Natal", Unit: "1",
    "First Name": "Donovan & Apphia", Surname: "Farao", Email: "don@x.co.za,apphia@x.co.za", Cell: "0821112222",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "7500",
  })
  // F2 (CD walk): a tenant row with NO name — must be flagged [first_name,last_name], not masked by "Unknown".
  const NONAME = row({
    Property: "Nameless House", Address: "3 Elm St", City: "Pretoria", Province: "Gauteng", Unit: "1",
    Email: "someone@x.co.za", Cell: "0823334444", "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "6000",
  })
  // F3 (CD walk): a lease row with BLANK rent — the lease must LAND (held 'draft', flagged), not be dropped.
  const NORENT = row({
    Property: "No Rent House", Address: "4 Fir Rd", City: "Cape Town", Province: "Western Cape", Unit: "1",
    "First Name": "Rent", Surname: "Less", Email: "rentless@x.co.za", Cell: "0825556666", "Lease Start": "2024-01-01", "Lease End": "2026-12-31",
    // NO Monthly Rent
  })

  beforeAll(async () => {
    agentId = seedUser()
    orgId = await seedEmptyOrg(db)
    await importRows(orgId, agentId, [INCOMPLETE, COMPLETE, JOINT, NONAME, NORENT])
  }, 120_000)

  afterAll(() => {
    if (orgId) teardownOrg(orgId)
    if (agentId) teardownUser(agentId)
  })

  it("a property with only a NAME LANDS (not refused) and is flagged missing address/city/province", async () => {
    const { data, error } = await db
      .from("properties").select("name, address_line1, incomplete_mandatory").eq("org_id", orgId).ilike("name", "Twin Peaks").single()
    if (error) throw new Error(error.message)
    expect(data.name, "the property was imported, not dropped (the relax)").toBe("Twin Peaks")
    expect(data.address_line1, "address is null, not invented").toBeNull()
    expect(data.incomplete_mandatory, "flagged with exactly what it lacks").toEqual(["address_line1", "city", "province"])
  })

  it("an email-less tenant lands flagged [primary_email] — the email-relax is now a persisted burn-down item (§7)", async () => {
    const { data, error } = await db
      .from("contacts").select("incomplete_mandatory").eq("org_id", orgId).eq("primary_role", "tenant").eq("first_name", "Nomsa").single()
    if (error) throw new Error(error.message)
    expect(data.incomplete_mandatory).toEqual(["primary_email"])
  })

  it("a JOINT-tenancy co-tenant (insertSingleTenant path) is flagged too — no untracked relaxed writer", async () => {
    // Donovan has both email + phone → complete; Apphia (the split-off half) got no phone → flagged.
    const { data: donovan, error: dErr } = await db.from("contacts").select("incomplete_mandatory").eq("org_id", orgId).eq("first_name", "Donovan").single()
    if (dErr) throw new Error(dErr.message)
    expect(donovan.incomplete_mandatory).toBeNull()
    const { data: apphia, error: aErr } = await db.from("contacts").select("incomplete_mandatory").eq("org_id", orgId).eq("first_name", "Apphia").single()
    if (aErr) throw new Error(aErr.message)
    expect(apphia.incomplete_mandatory, "the co-tenant lands ON the burn-down, not off it").toEqual(["primary_phone"])
  })

  it("F2: a nameless tenant is flagged [first_name, last_name] — not masked by the 'Unknown' fallback", async () => {
    const { data, error } = await db.from("contacts")
      .select("first_name, incomplete_mandatory").eq("org_id", orgId).eq("primary_email", "someone@x.co.za").single()
    if (error) throw new Error(error.message)
    expect(data.first_name, "still stored as the 'Unknown' display placeholder").toBe("Unknown")
    expect(data.incomplete_mandatory, "but flagged on the RAW missing name").toEqual(["first_name", "last_name"])
  })

  it("F3: a lease with blank rent LANDS held 'draft', flagged [rent_amount_cents], and cannot activate", async () => {
    const { data: leases, error: lErr } = await db.from("leases")
      .select("id, status, rent_amount_cents, incomplete_mandatory").eq("org_id", orgId)
    if (lErr) throw new Error(lErr.message)
    const norent = leases!.find((l) => (l.incomplete_mandatory ?? []).includes("rent_amount_cents"))
    expect(norent, "the lease landed — not dropped into errors[]").toBeTruthy()
    expect(norent!.status, "held inactive").toBe("draft")
    expect(norent!.rent_amount_cents, "rent is null, not invented").toBeNull()

    const prereqs = await checkLeasePrerequisites(db, norent!.id as string, orgId)
    const gate = prereqs.items.find((i) => i.key === "mandatory_fields")
    expect(gate?.status, "the activation gate fails while a mandatory field is missing").toBe("fail")
    expect(prereqs.canProceed, "cannot activate an incomplete lease").toBe(false)
  })

  it("a COMPLETE property and tenant carry a NULL flag (not a burn-down item)", async () => {
    const { data: p, error: pErr } = await db.from("properties").select("incomplete_mandatory").eq("org_id", orgId).ilike("name", "Complete House").single()
    if (pErr) throw new Error(pErr.message)
    expect(p.incomplete_mandatory).toBeNull()
    const { data: c, error: cErr } = await db.from("contacts").select("incomplete_mandatory").eq("org_id", orgId).eq("first_name", "Full").single()
    if (cErr) throw new Error(cErr.message)
    expect(c.incomplete_mandatory).toBeNull()
  })
})
