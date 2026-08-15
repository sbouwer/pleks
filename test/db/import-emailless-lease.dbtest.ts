/**
 * test/db/import-emailless-lease.dbtest.ts — an email-less tenant's LEASE lands linked, not refused (21E §7B)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  §7B closes the second half of the email-relax. §7 lets an email-less tenant IMPORT (flagged); but the
 *         tenantIdCache was keyed by email alone, so its lease cache-MISSED in Phase 5 and was pushed to errors[]
 *         tenant-less — the relax's whole point (import the party WITH their lease) was half-done. The KEY LADDER
 *         (email → "id:"+hash(id_number) → "__row:"+index) keys the create AND the lease lookup identically, so
 *         the lease finds its tenant. Consequences the ladder must get right, all asserted here:
 *           · an email-less tenant (id rung AND row rung) → lease LANDS with tenant_id set
 *           · it composes with F3: email-less + blank rent → lease lands held 'draft', tenant_id set
 *           · two rows with the same id_number → ONE tenant (real dedup on the id rung)
 *           · two different people who share a name (different phones, no id) → TWO tenants (NEVER merged — the
 *             row-index floor cannot collapse them; name+phone is fuzzy-hold-only, never a hard key)
 *
 *         ⚠ PROBE-FIRES: the "lease lands with tenant_id" assertions were verified FAILING against the pre-§7B
 *         importer (email-only key) — the lease was tenant-less in errors[] and no leases row existed. See the
 *         probe note at the foot of this file for the exact reproduction. A green here is the ladder working.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport } from "@/lib/import/importRunner"
import { hashIdNumber } from "@/lib/crypto/idNumber"

const db = svc()

const HEADERS = [
  "Property", "Address", "City", "Province", "Unit",
  "First Name", "Surname", "ID Number", "Email", "Cell", "Lease Start", "Lease End", "Monthly Rent",
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

// A shared id_number for the dedup case. Validity is irrelevant to the ladder — the id rung hashes whatever the
// cell holds — so any consistent string collides; a data-quality tag is harmless (it is a tag, not a hold).
const DUP_ID = "9001015800088"

describe("IMPORT §7B — an email-less tenant's lease lands linked, never refused", () => {
  let agentId: string
  let orgId: string

  // email-less, NO id, complete terms → the "__row:"+index rung. Its lease must land with tenant_id set.
  const ROWRUNG = row({
    Property: "Rowrung House", Address: "1 A St", City: "Cape Town", Province: "Western Cape", Unit: "1",
    "First Name": "Sipho", Surname: "Ncube", Cell: "0821110001",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "8000",
  })
  // email-less, WITH id, complete terms → the "id:"+hash rung. Lease link resolves via the id rung.
  const IDRUNG = row({
    Property: "Idrung House", Address: "2 B St", City: "Durban", Province: "KwaZulu-Natal", Unit: "1",
    "First Name": "Zanele", Surname: "Dube", "ID Number": "8202025800083", Cell: "0821110002",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "8500",
  })
  // email-less AND blank rent → §7B links the tenant, F3 holds the lease 'draft'. The two compose.
  const COMPOSE = row({
    Property: "Compose House", Address: "3 C St", City: "Pretoria", Province: "Gauteng", Unit: "1",
    "First Name": "Thabo", Surname: "Mokoena", Cell: "0821110003",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31",
    // NO Monthly Rent
  })
  // Two IDENTICAL rows (same id, same person) → ONE tenant. A genuine duplicated export line.
  const DUP_A = row({
    Property: "Dup House", Address: "4 D St", City: "Cape Town", Province: "Western Cape", Unit: "1",
    "First Name": "Lerato", Surname: "Khumalo", "ID Number": DUP_ID, Cell: "0821110004",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "7000",
  })
  const DUP_B = { ...DUP_A }
  // Two DIFFERENT people who share a name — no email, no id, DIFFERENT phones, DIFFERENT properties. The fuzzy
  // band is name+phone-BOTH; different phones means no match → both CREATE. The ladder must NOT collapse them.
  const CLASH_A = row({
    Property: "Clash House A", Address: "5 E St", City: "Cape Town", Province: "Western Cape", Unit: "1",
    "First Name": "John", Surname: "Smith", Cell: "0821110005",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "6000",
  })
  const CLASH_B = row({
    Property: "Clash House B", Address: "6 F St", City: "Durban", Province: "KwaZulu-Natal", Unit: "1",
    "First Name": "John", Surname: "Smith", Cell: "0827770006",
    "Lease Start": "2024-01-01", "Lease End": "2026-12-31", "Monthly Rent": "6500",
  })

  let result: Awaited<ReturnType<typeof runImport>>

  beforeAll(async () => {
    agentId = seedUser()
    orgId = await seedEmptyOrg(db)
    result = await importRows(orgId, agentId, [ROWRUNG, IDRUNG, COMPOSE, DUP_A, DUP_B, CLASH_A, CLASH_B])
  }, 120_000)

  afterAll(() => {
    if (orgId) teardownOrg(orgId)
    if (agentId) teardownUser(agentId)
  })

  async function tenantIdFor(firstName: string): Promise<string> {
    const { data, error } = await db.from("contacts")
      .select("id, incomplete_mandatory").eq("org_id", orgId).eq("primary_role", "tenant").eq("first_name", firstName)
    if (error) throw new Error(error.message)
    const contact = data![0]
    const { data: t, error: tErr } = await db.from("tenants").select("id").eq("contact_id", contact.id).single()
    if (tErr) throw new Error(tErr.message)
    return t.id as string
  }

  it("email-less tenant on the ROW rung: its lease lands with tenant_id set — not refused tenant-less", async () => {
    const tenantId = await tenantIdFor("Sipho")
    const { data: lease, error } = await db.from("leases")
      .select("id, tenant_id, status").eq("org_id", orgId).eq("tenant_id", tenantId).maybeSingle()
    if (error) throw new Error(error.message)
    expect(lease, "the lease landed — pre-§7B it was pushed to errors[] tenant-less").toBeTruthy()
    expect(lease!.tenant_id, "linked to the email-less tenant via the row-index rung").toBe(tenantId)
  })

  it("email-less tenant on the ID rung: its lease resolves via id:+hash and lands linked", async () => {
    const tenantId = await tenantIdFor("Zanele")
    const { data: lease, error } = await db.from("leases")
      .select("id, tenant_id").eq("org_id", orgId).eq("tenant_id", tenantId).maybeSingle()
    if (error) throw new Error(error.message)
    expect(lease, "the id-rung lease landed").toBeTruthy()
    expect(lease!.tenant_id).toBe(tenantId)
  })

  it("§7B composes with F3: email-less + blank rent → lease lands held 'draft', tenant_id set, flagged rent", async () => {
    const tenantId = await tenantIdFor("Thabo")
    const { data: lease, error } = await db.from("leases")
      .select("tenant_id, status, rent_amount_cents, incomplete_mandatory").eq("org_id", orgId).eq("tenant_id", tenantId).single()
    if (error) throw new Error(error.message)
    expect(lease.tenant_id, "the tenant was linked (§7B)").toBe(tenantId)
    expect(lease.status, "the lease is held inactive (F3)").toBe("draft")
    expect(lease.rent_amount_cents, "rent is null, not invented").toBeNull()
    expect(lease.incomplete_mandatory, "flagged on the burn-down (F3)").toEqual(["rent_amount_cents"])
    // And the tenant itself is flagged for the missing email (§7)
    const { data: c, error: cErr } = await db.from("contacts").select("incomplete_mandatory").eq("org_id", orgId).eq("first_name", "Thabo").single()
    if (cErr) throw new Error(cErr.message)
    expect(c!.incomplete_mandatory).toEqual(["primary_email"])
  })

  it("two identical rows (same id_number) → exactly ONE tenant (dedup on the id rung)", async () => {
    const { data, error } = await db.from("contacts")
      .select("id").eq("org_id", orgId).eq("id_number_hash", hashIdNumber(DUP_ID))
    if (error) throw new Error(error.message)
    expect(data!.length, "the duplicate export line collapsed to one person").toBe(1)
  })

  it("two DIFFERENT people who share a name (diff phones, no id) → TWO tenants, never merged", async () => {
    const { data, error } = await db.from("contacts")
      .select("id, primary_phone, incomplete_mandatory").eq("org_id", orgId).eq("first_name", "John").eq("last_name", "Smith")
    if (error) throw new Error(error.message)
    expect(data!.length, "the row-index floor keeps two coincidental namesakes apart").toBe(2)
    // both are email-less → both on the burn-down
    for (const c of data!) expect(c.incomplete_mandatory).toContain("primary_email")
  })

  it("no email-less row was silently lost: every email-less tenant it created also has a landed lease", async () => {
    // The regression this file exists for: a tenant created but its lease dropped to errors[]. Assert the join.
    for (const name of ["Sipho", "Zanele", "Thabo"]) {
      const tenantId = await tenantIdFor(name)
      const { data: lease, error: lErr } = await db.from("leases").select("id").eq("org_id", orgId).eq("tenant_id", tenantId).maybeSingle()
      if (lErr) throw new Error(lErr.message)
      expect(lease, `${name}'s lease must exist (no tenant-less refusal)`).toBeTruthy()
    }
    // And none of them is sitting in errors[] as "no tenant was resolved".
    const orphaned = result.errors.filter((e) => e.message.includes("no tenant was resolved"))
    expect(orphaned, "no lease was refused for want of a tenant").toEqual([])
  })
})

/*
 * PROBE (probe-fires proof) — how the §7B assertions were shown FAILING against the broken code:
 *
 *   git stash push -- lib/import/importRunner.ts     # revert to the email-only key
 *   npm run test:db -- import-emailless-lease
 *   git stash pop
 *
 * Pre-§7B result (email-only key, cacheTenant skipped email-less):
 *   ✗ "email-less tenant on the ROW rung ..."  — lease is null (cache-missed on "" → pushed to errors[] tenant-less)
 *   ✗ "email-less tenant on the ID rung ..."   — lease is null (same)
 *   ✗ "§7B composes with F3 ..."               — .single() throws: 0 rows (no lease was created at all)
 *   ✗ "no email-less row was silently lost"    — result.errors contains "no tenant was resolved for the primary email"
 * The same-id-dedup and namesake-split assertions PASSED pre-fix (they exercise the tenant phase, which §7 already
 * relaxed) — only the LEASE-link assertions moved from red to green, which is exactly the half §7B fixes.
 */
