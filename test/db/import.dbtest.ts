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
import { toImportDecisions } from "@/lib/import/decisions"
import { saTodayISO, addCalendarMonths } from "@/lib/dates"
import { decryptBankAccount, hashBankAccount } from "@/lib/crypto/bankAccount"

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

// Built through the REAL wire translator, not hand-rolled — the wizard→runner contract is exactly what F-13
// found broken (they shared no key but columnMapping), so a test that hand-builds the runner's shape would
// test a shape production never produces.
const decisions: ImportDecisions = toImportDecisions({ expiredLeaseAction: "import_as_expired" })

/** A DD/MM/YYYY date `months` from today (negative = past). Fixtures must be relative: the runner compares
 *  end_date to saTodayISO(), so a literal "28/02/2027" quietly flips an expired/active assertion in 2027. */
function dmy(months: number): string {
  const iso = addCalendarMonths(saTodayISO(), months)
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

/** A realistic af-ZA book: an abbreviated province, a commercial lease, joint tenants, and one bad cell. */
const ROWS: Record<string, string>[] = [
  {
    // R6 600,00 exported as 660000 CENTS by a Pleks-shaped re-export. "Retail" is a COMMERCIAL lease.
    Property: "Acacia Court", Address: "12 Acacia Rd", City: "Cape Town", Province: "WC", Unit: "1",
    "First Name": "Thabo", "Last Name": "Nkosi", Email: "thabo@example.co.za",
    "Lease Start": dmy(-4), "Lease End": dmy(+8),
    monthly_rent_cents: "660000", "Lease Type": "Retail",
  },
  {
    // Joint tenants: one row, two people, two emails.
    Property: "Acacia Court", Address: "12 Acacia Rd", City: "Cape Town", Province: "WC", Unit: "2",
    "First Name": "Donovan & Apphia", "Last Name": "Meyer", Email: "donovan@example.co.za, apphia@example.co.za",
    "Lease Start": dmy(-3), "Lease End": dmy(+9),
    monthly_rent_cents: "850000", "Lease Type": "Residential",
  },
  {
    // An unclassifiable lease type. It must REFUSE the lease, not quietly file it as residential.
    Property: "Acacia Court", Address: "12 Acacia Rd", City: "Cape Town", Province: "WC", Unit: "3",
    "First Name": "Lerato", "Last Name": "Dlamini", Email: "lerato@example.co.za",
    "Lease Start": dmy(-2), "Lease End": dmy(+10),
    monthly_rent_cents: "700000", "Lease Type": "Mixed Use",
  },
]

interface LeaseRow {
  id: string; unit_id: string; property_id: string | null; tenant_id: string
  rent_amount_cents: number; lease_type: string; escalation_percent: string | number
  cpa_applies: boolean; start_date: string; end_date: string | null; status: string
}

async function leasesOf(orgId: string): Promise<LeaseRow[]> {
  const { data, error } = await db
    .from("leases")
    .select("id, unit_id, property_id, tenant_id, rent_amount_cents, lease_type, escalation_percent, cpa_applies, start_date, end_date, status")
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
    }
  })

  it("marks the unit OCCUPIED — an imported live lease must not leave the unit reading as vacant", async () => {
    // units.status DEFAULTs to 'vacant' and the importer never set it, so a founding agent migrating 100 live
    // leases saw 100 empty units: every occupancy figure and vacancy report wrong on day one.
    const { data: units, error } = await db.from("units").select("unit_number, status").eq("org_id", orgId)
    expect(error).toBeFalsy()

    const byNumber = Object.fromEntries((units ?? []).map((u) => [u.unit_number, u.status]))
    expect(byNumber["1"], "unit 1 has a live lease").toBe("occupied")
    expect(byNumber["2"], "unit 2 has a live lease").toBe("occupied")
    // Unit 3's lease was REFUSED (unclassifiable type) — no lease, so it must stay vacant.
    expect(byNumber["3"], "unit 3's lease was refused — it is not occupied").toBe("vacant")

    const { count } = await db
      .from("unit_status_history").select("id", { count: "exact", head: true }).eq("org_id", orgId)
    expect(count, "the transition is recorded, once per occupied unit").toBe(2)
  })

  it("WARNS that an unmapped escalation column means the system chose the rate, not the lease", async () => {
    // escalation_percent is NOT NULL DEFAULT 10.00. Our fixture maps no escalation column, so every lease
    // silently imports at 10% a year — and the escalation notice then tells tenants their rent rises 10%.
    // The value landing at 10 is the DB's business; the agent being TOLD is ours. (An earlier version of this
    // test asserted `escalation_percent === 10` as if it were correct — a test pinning a fail-open.)
    const warned = first.errors.find((e) => e.field === "escalation_percent" && e.rowIndex === -1)
    expect(warned, "the agent must be told the escalation rate was defaulted").toBeTruthy()
    expect(warned?.severity).toBe("warning")
    expect(warned?.message).toContain("10%")

    const leases = await leasesOf(orgId)
    expect(leases.every((l) => Number(l.escalation_percent) === 10), "the default did land").toBe(true)
  })

  it("a COMMERCIAL lease never imports as CPA-governed (migration 010's invariant)", async () => {
    // Only reachable BECAUSE the lease_type fix works: previously every lease imported as "residential", so
    // cpa_applies DEFAULT true was never visibly wrong. Now "Retail" correctly lands commercial — and the
    // default would raise CPA s14 auto-renewal deadlines against a lease the CPA does not govern.
    const leases = await leasesOf(orgId)
    const retail = leases.find((l) => l.lease_type === "commercial")
    expect(retail, "the Retail lease is commercial").toBeTruthy()
    expect(retail?.cpa_applies, "a commercial lease must not be CPA-governed").toBe(false)

    const residential = leases.find((l) => l.lease_type === "residential")
    expect(residential?.cpa_applies, "a residential lease keeps the CPA default").toBe(true)
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
        "Lease Start": dmy(-4), "Lease End": dmy(+8),
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
        "Lease Start": dmy(-4), "Lease End": dmy(+8),
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

  // ── F-13: the wizard's decisions must actually reach the runner ──

  /** One lease that ended in the past, one that is live — RELATIVE TO TODAY. The runner compares end_date
   *  against saTodayISO(), so a hard-coded future date is a time bomb: these assertions would silently invert
   *  the day the literal fell into the past. */
  const EXPIRED_ROWS: Record<string, string>[] = [
    {
      Property: "Expiry Court", Address: "9 Expiry Rd", City: "Cape Town", Province: "WC", Unit: "1",
      "First Name": "Pieter", "Last Name": "Botha", Email: "pieter@example.co.za",
      "Lease Start": dmy(-24), "Lease End": dmy(-12),      // ended a year ago
      monthly_rent_cents: "400000", "Lease Type": "Residential",
    },
    {
      Property: "Expiry Court", Address: "9 Expiry Rd", City: "Cape Town", Province: "WC", Unit: "2",
      "First Name": "Zanele", "Last Name": "Ndlovu", Email: "zanele@example.co.za",
      "Lease Start": dmy(-4), "Lease End": dmy(+8),        // still running
      monthly_rent_cents: "550000", "Lease Type": "Residential",
    },
  ]

  it("F-13: \"Skip expired leases\" (the wizard DEFAULT) actually skips them", async () => {
    // Step4Confirm prints "Expired leases will be skipped" on the confirmation screen. The runner read
    // `decisions.expiredLeases`, which the wizard never sent — so it was always undefined, the branch was
    // dead, and every expired lease was imported anyway. The agent was told the opposite of what happened.
    const org = await seedEmptyOrg(db)
    try {
      const skip = toImportDecisions({ expiredLeaseAction: "skip" })
      const r = await runImport(EXPIRED_ROWS, mapping, skip, org, agentId, undefined, db)

      const leases = await leasesOf(org)
      expect(leases, "only the LIVE lease imports").toHaveLength(1)
      expect(leases[0]?.rent_amount_cents).toBe(550_000)
      expect(r.leasesCreated).toBe(1)

      // The dead tenancy is preserved as history rather than as a lease.
      expect(await countOf("tenancy_history", org), "the expired tenancy becomes history").toBe(1)
    } finally {
      teardownOrg(org)
    }
  })

  it("F-13: \"Import as expired\" imports it as a lease with status 'expired'", async () => {
    const org = await seedEmptyOrg(db)
    try {
      const asExpired = toImportDecisions({ expiredLeaseAction: "import_as_expired" })
      await runImport(EXPIRED_ROWS, mapping, asExpired, org, agentId, undefined, db)

      const leases = await leasesOf(org)
      expect(leases, "both leases import").toHaveLength(2)
      expect(leases.find((l) => l.rent_amount_cents === 400_000)?.status).toBe("expired")
      expect(leases.find((l) => l.rent_amount_cents === 550_000)?.status).toBe("active")
    } finally {
      teardownOrg(org)
    }
  })

  it("F-13: the per-row \"Keep active\" override imports a stale-dated lease as LIVE", async () => {
    // The commonest shape in a migrated book: a renewal the old system never captured, so the end date looks
    // stale. The wizard has always offered this checkbox; the runner had no concept of it, so ticking it did
    // nothing — and under the (also-broken) "skip" default the lease simply vanished.
    const org = await seedEmptyOrg(db)
    try {
      const keepActive = toImportDecisions({
        expiredLeaseAction: "skip",
        perRowOverrides: { 0: "active" },   // row 0 is the dead-dated lease
      })
      const r = await runImport(EXPIRED_ROWS, mapping, keepActive, org, agentId, undefined, db)

      expect(r.leasesCreated, "BOTH import — the override rescues the stale-dated one").toBe(2)
      const leases = await leasesOf(org)
      expect(leases.find((l) => l.rent_amount_cents === 400_000)?.status, "kept ACTIVE despite the past end date").toBe("active")
    } finally {
      teardownOrg(org)
    }
  })

  it("F-13: \"Keep active\" works on ANY row of a unit group, not just its first", async () => {
    // Step 3 renders a checkbox per FILE ROW and knows nothing about unit grouping, so co-tenants on one unit
    // are two identical-looking lines. Testing only the group's FIRST row meant ticking the second line did
    // nothing — and the lease the agent had just explicitly rescued was diverted to history and never created.
    const org = await seedEmptyOrg(db)
    try {
      const coTenantRows: Record<string, string>[] = [
        {
          Property: "Sea Point", Address: "3 Beach Rd", City: "Cape Town", Province: "WC", Unit: "3A",
          "First Name": "Alice", "Last Name": "Smit", Email: "alice@example.co.za",
          "Lease Start": dmy(-24), "Lease End": dmy(-12),   // stale-dated
          monthly_rent_cents: "480000", "Lease Type": "Residential",
        },
        {
          Property: "Sea Point", Address: "3 Beach Rd", City: "Cape Town", Province: "WC", Unit: "3A",
          "First Name": "Bob", "Last Name": "Smit", Email: "bob@example.co.za",
          "Lease Start": dmy(-24), "Lease End": dmy(-12),   // same unit → same group, row 1
          monthly_rent_cents: "480000", "Lease Type": "Residential",
        },
      ]

      // The agent ticks "Keep active" on the SECOND line (row 1) — not the group's first row.
      const keepActive = toImportDecisions({
        expiredLeaseAction: "skip",
        perRowOverrides: { 1: "active" },
      })
      const r = await runImport(coTenantRows, mapping, keepActive, org, agentId, undefined, db)

      expect(r.leasesCreated, "the override must rescue the group's lease").toBe(1)
      const leases = await leasesOf(org)
      expect(leases[0]?.status, "kept ACTIVE despite the stale end date").toBe("active")
    } finally {
      teardownOrg(org)
    }
  })

  it("F-13: a per-row \"skip\" drops the row entirely", async () => {
    const org = await seedEmptyOrg(db)
    try {
      const skipRow = toImportDecisions({
        expiredLeaseAction: "import_as_expired",
        perRowOverrides: { 1: "skip" },     // drop the LIVE lease
      })
      await runImport(EXPIRED_ROWS, mapping, skipRow, org, agentId, undefined, db)

      const leases = await leasesOf(org)
      expect(leases, "the skipped row created no lease").toHaveLength(1)
      expect(leases[0]?.rent_amount_cents).toBe(400_000)
    } finally {
      teardownOrg(org)
    }
  })

  // ── F-11 / F-10: bank details are ENCRYPTED, and consent reflects the AGENT'S ATTESTATION ──

  const BANK_COLUMNS: ColumnMapping = {
    ...mapping,
    "Bank Account": { column: "Bank Account", field: "tenant_bank_account_1", entity: "bank" },
    "Bank Name": { column: "Bank Name", field: "tenant_bank_name_1", entity: "bank" },
  }
  const RAW_ACCOUNT = "6241234567"
  const bankRow = (email: string): Record<string, string>[] => [{
    Property: "Bank Court", Address: "5 Bank Rd", City: "Cape Town", Province: "WC", Unit: "1",
    "First Name": "Naledi", "Last Name": "Mokoena", Email: email,
    "Lease Start": dmy(-4), "Lease End": dmy(+8),
    monthly_rent_cents: "500000", "Lease Type": "Residential",
    "Bank Account": RAW_ACCOUNT, "Bank Name": "FNB",
  }]

  it("F-11: the account number is ENCRYPTED and recoverable — a mask alone cannot process a refund", async () => {
    const org = await seedEmptyOrg(db)
    try {
      const attested = { ...toImportDecisions({ expiredLeaseAction: "skip" }), bankConsentAttested: true }
      await runImport(bankRow("naledi@example.co.za"), BANK_COLUMNS, attested, org, agentId, undefined, db)

      const { data, error } = await db
        .from("tenant_bank_accounts")
        .select("account_number, account_number_enc, account_number_hash, consent_given, consent_given_at")
        .eq("org_id", org).single()
      expect(error).toBeFalsy()

      // The stored `account_number` is the MASK — the raw number must never sit in it.
      expect(data?.account_number).not.toBe(RAW_ACCOUNT)
      expect(data?.account_number).toContain("4567")

      // …and account_number_enc — the column that has existed unused since migration 042 — round-trips.
      expect(data?.account_number_enc, "the ciphertext must be written").toBeTruthy()
      expect(data?.account_number_enc).not.toBe(RAW_ACCOUNT)
      expect(decryptBankAccount(data?.account_number_enc), "an agent must get the real number back").toBe(RAW_ACCOUNT)

      // The deterministic lookup key is computed from the RAW value (never the ciphertext).
      expect(data?.account_number_hash).toBe(hashBankAccount(RAW_ACCOUNT))
    } finally {
      teardownOrg(org)
    }
  })

  it("F-10: consent records the AGENT'S ATTESTATION — it is not manufactured", async () => {
    const org = await seedEmptyOrg(db)
    try {
      const attested = { ...toImportDecisions({ expiredLeaseAction: "skip" }), bankConsentAttested: true }
      await runImport(bankRow("attested@example.co.za"), BANK_COLUMNS, attested, org, agentId, undefined, db)

      const { data: acct, error: acctErr } = await db
        .from("tenant_bank_accounts").select("consent_given, consent_given_at").eq("org_id", org).single()
      expect(acctErr).toBeFalsy()
      expect(acct?.consent_given).toBe(true)
      expect(acct?.consent_given_at).toBeTruthy()

      // The attestation itself is on the record — actor, notice version, and what was actually declared.
      const { data: consent, error: consentErr } = await db
        .from("consent_log").select("consent_type, consent_given, consent_version, user_id, metadata")
        .eq("org_id", org).eq("consent_type", "bank_details_import").single()
      expect(consentErr).toBeFalsy()
      expect(consent?.consent_given).toBe(true)
      expect(consent?.user_id, "attributed to the agent who attested").toBe(agentId)
      expect(consent?.consent_version).toBeTruthy()
      expect((consent?.metadata as { declaration?: string })?.declaration ?? "").toContain("attested")
    } finally {
      teardownOrg(org)
    }
  })

  it("F-10: WITHOUT the attestation, the account is recorded as UNCONSENTED (it used to say true regardless)", async () => {
    const org = await seedEmptyOrg(db)
    try {
      // The agent never ticked the notice. The old code wrote consent_given: true anyway.
      const notAttested = toImportDecisions({ expiredLeaseAction: "skip" })
      const r = await runImport(bankRow("noconsent@example.co.za"), BANK_COLUMNS, notAttested, org, agentId, undefined, db)

      const { data: acct, error: acctErr } = await db
        .from("tenant_bank_accounts").select("consent_given, consent_given_at").eq("org_id", org).single()
      expect(acctErr).toBeFalsy()
      expect(acct?.consent_given, "no attestation ⇒ no consent").toBe(false)
      expect(acct?.consent_given_at).toBeNull()

      // The NEGATIVE record matters as much as the positive one — it is what a regulator would ask for.
      const { data: consent, error: consentErr } = await db
        .from("consent_log").select("consent_given, metadata").eq("org_id", org).eq("consent_type", "bank_details_import").single()
      expect(consentErr).toBeFalsy()
      expect(consent?.consent_given).toBe(false)
      expect((consent?.metadata as { declaration?: string })?.declaration ?? "").toContain("WITHOUT")

      expect(r.errors.some((e) => e.message.includes("without confirming you hold the tenant's consent"))).toBe(true)
    } finally {
      teardownOrg(org)
    }
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
        "Lease Start": dmy(-5), "Lease End": dmy(+7),
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
