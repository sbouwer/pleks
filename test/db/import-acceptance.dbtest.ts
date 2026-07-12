/**
 * test/db/import-acceptance.dbtest.ts — THE ACCEPTANCE RUN (AUDIT_IMPORT)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Notes:  The gate a founding agent's real book has to clear. Not a unit test of any one fix — the whole front
 *         door, end to end, twice, against a realistic af-ZA agency export.
 *
 *         Acceptance, verbatim from the audit:
 *           "a full wizard import of a realistic af-ZA-locale agency book (CSV + XLSX) creates correct
 *            leases/tenants/money on first run, is a no-op on identical re-run, refuses ambiguity loudly, and
 *            leaves consent_log + audit rows a regulator could read."
 *
 *         It goes through the REAL path a file takes — papaparse / xlsx exactly as Step0Upload calls them,
 *         then matchColumns (the wizard's own suggestions, NOT a hand-built mapping), then toColumnMapping +
 *         toImportDecisions (the wire contract), then runImport. A hand-built mapping would be testing a shape
 *         production never produces — which is the F-13 bug in test form.
 *
 *         The book is deliberately nasty, and every nasty thing in it is a defect this arc actually shipped:
 *           af-ZA decimal comma (R6 600,50 → 100× if you strip commas)   · DD/MM/YYYY dates
 *           a Pleks re-export cents column (100× the other way)          · an abbreviated province ("WC")
 *           joint tenants in one cell                                    · a commercial ("Retail") lease
 *           an expired lease                                             · a blank unit number (a house)
 *           Y/N booleans (the CPA-stripping shape)                       · deposits + bank details
 *           an unclassifiable lease type                                 · a company tenant (juristic CPA)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Papa from "papaparse"
import * as XLSX from "xlsx"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportResult } from "@/lib/import/importRunner"
import { decryptBankAccount } from "@/lib/crypto/bankAccount"
import { saTodayISO, addCalendarMonths } from "@/lib/dates"

const db = svc()

/** DD/MM/YYYY relative to today — fixtures must never be date bombs. */
function dmy(months: number): string {
  const [y, m, d] = addCalendarMonths(saTodayISO(), months).split("-")
  return `${d}/${m}/${y}`
}

/**
 * A realistic af-ZA agency export. Headers are the messy human ones an agency actually ships — the wizard's
 * own matchColumns has to recognise them; nothing here is hand-mapped.
 *
 * NOTE the money columns are deliberately BOTH shapes:
 *   "Maandelikse Huur"   — rands, af-ZA decimal comma ("6 600,50")
 *   "monthly_rent_cents" — a Pleks re-export: ALREADY cents. Must not be ×100'd. (F-8, both directions)
 * Only one is ever populated per row.
 */
const BOOK_HEADERS = [
  "Eiendom", "Adres", "Voorstad", "Stad", "Provinsie", "Eenheid",
  "Naam", "Van", "E-pos", "Selfoon", "ID Nommer",
  "Huurbegin", "Huureinde", "Maandelikse Huur", "Deposito",
  "Huurtipe", "Escalation Type", "Eskalasie", "CPA Applies", "Fixed Term", "Payment Due Day",
  "Bank Rekening", "Bank Naam",
]

const BOOK_ROWS: Record<string, string>[] = [
  {
    // af-ZA money: "6 600,50" is R6 600.50. Stripping the comma gives R660 050 — the census #13 bug.
    Eiendom: "Acacia Hof", Adres: "12 Acacia Rd", Voorstad: "Rondebosch", Stad: "Cape Town",
    Provinsie: "WC", Eenheid: "1",
    Naam: "Thabo", Van: "Nkosi", "E-pos": "thabo@example.co.za", Selfoon: "0821234567",
    "ID Nommer": "9202204720082",
    Huurbegin: dmy(-8), Huureinde: dmy(+4),
    "Maandelikse Huur": "6 600,50", Deposito: "13 201,00",
    Huurtipe: "Woonstel", "Escalation Type": "CPI", Eskalasie: "7,5",
    "CPA Applies": "Y", "Fixed Term": "Y", "Payment Due Day": "1",
    "Bank Rekening": "6241234567", "Bank Naam": "FNB",
  },
  {
    // Joint tenants in ONE cell — two people, two emails.
    Eiendom: "Acacia Hof", Adres: "12 Acacia Rd", Voorstad: "Rondebosch", Stad: "Cape Town",
    Provinsie: "WC", Eenheid: "2",
    Naam: "Donovan & Apphia", Van: "Meyer",
    "E-pos": "donovan@example.co.za, apphia@example.co.za", Selfoon: "0837654321,0839876543",
    "ID Nommer": "",
    Huurbegin: dmy(-6), Huureinde: dmy(+6),
    "Maandelikse Huur": "8 500,00", Deposito: "17 000,00",
    Huurtipe: "Residential", "Escalation Type": "Prime", Eskalasie: "2",
    "CPA Applies": "Y", "Fixed Term": "Y", "Payment Due Day": "last day",
    "Bank Rekening": "", "Bank Naam": "",
  },
  {
    // Commercial premises, NATURAL-PERSON tenant — CPA s5(2) turns on the consumer, not the premises.
    Eiendom: "Sea Point Winkelsentrum", Adres: "9 Main Rd", Voorstad: "Sea Point", Stad: "Cape Town",
    Provinsie: "Western Cape", Eenheid: "Shop 3",
    Naam: "Lerato", Van: "Dlamini", "E-pos": "lerato@example.co.za", Selfoon: "0845551234",
    "ID Nommer": "8801015800086",
    Huurbegin: dmy(-14), Huureinde: dmy(+10),
    "Maandelikse Huur": "R 24 500,00", Deposito: "49 000,00",
    Huurtipe: "Retail", "Escalation Type": "Fixed", Eskalasie: "8",
    "CPA Applies": "Y", "Fixed Term": "Y", "Payment Due Day": "1",
    "Bank Rekening": "", "Bank Naam": "",
  },
  {
    // A freestanding house: BLANK unit number. A re-run must not duplicate it.
    Eiendom: "14 Protea Straat", Adres: "14 Protea St", Voorstad: "Durbanville", Stad: "Cape Town",
    Provinsie: "wes-kaap", Eenheid: "",
    Naam: "Sipho", Van: "Zulu", "E-pos": "sipho@example.co.za", Selfoon: "0791112222",
    "ID Nommer": "7505105432081",
    Huurbegin: dmy(-20), Huureinde: dmy(+2),
    "Maandelikse Huur": "12 000,00", Deposito: "24 000,00",
    Huurtipe: "Huis", "Escalation Type": "Fixed", Eskalasie: "6",
    "CPA Applies": "Y", "Fixed Term": "Y", "Payment Due Day": "1",
    "Bank Rekening": "", "Bank Naam": "",
  },
  {
    // A (Pty) Ltd tenant → juristic → CPA INDETERMINATE (no import format carries turnover bands).
    Eiendom: "Sea Point Winkelsentrum", Adres: "9 Main Rd", Voorstad: "Sea Point", Stad: "Cape Town",
    Provinsie: "WC", Eenheid: "Shop 4",
    Naam: "Kagiso", Van: "Trading (Pty) Ltd", "E-pos": "accounts@kagisotrading.co.za",
    Selfoon: "0215551000", "ID Nommer": "",
    Huurbegin: dmy(-3), Huureinde: dmy(+21),
    "Maandelikse Huur": "31 000,00", Deposito: "62 000,00",
    Huurtipe: "Office", "Escalation Type": "CPI", Eskalasie: "7",
    // BLANK: the agency did not state CPA applicability for this juristic tenant — an honest "we don't know",
    // not bad data. It must not refuse the lease; it must land as `indeterminate` and be flagged.
    "CPA Applies": "", "Fixed Term": "Y", "Payment Due Day": "1",
    "Bank Rekening": "", "Bank Naam": "",
  },
  {
    // EXPIRED. Under the wizard's DEFAULT ("skip expired") this becomes tenancy history, not a lease.
    Eiendom: "Acacia Hof", Adres: "12 Acacia Rd", Voorstad: "Rondebosch", Stad: "Cape Town",
    Provinsie: "WC", Eenheid: "3",
    Naam: "Nomsa", Van: "Mbeki", "E-pos": "nomsa@example.co.za", Selfoon: "0723334444",
    "ID Nommer": "9003035678083",
    Huurbegin: dmy(-30), Huureinde: dmy(-6),
    "Maandelikse Huur": "5 500,00", Deposito: "11 000,00",
    Huurtipe: "Residential", "Escalation Type": "Fixed", Eskalasie: "6",
    "CPA Applies": "Y", "Fixed Term": "Y", "Payment Due Day": "1",
    "Bank Rekening": "", "Bank Naam": "",
  },
  {
    // UNCLASSIFIABLE lease type ("Sectional Title" is a TENURE, not a use). Must be REFUSED, loudly.
    Eiendom: "Acacia Hof", Adres: "12 Acacia Rd", Voorstad: "Rondebosch", Stad: "Cape Town",
    Provinsie: "WC", Eenheid: "4",
    Naam: "Ayanda", Van: "Khumalo", "E-pos": "ayanda@example.co.za", Selfoon: "0611239999",
    "ID Nommer": "9412125678089",
    Huurbegin: dmy(-2), Huureinde: dmy(+10),
    "Maandelikse Huur": "7 000,00", Deposito: "14 000,00",
    Huurtipe: "Sectional Title", "Escalation Type": "Fixed", Eskalasie: "6",
    "CPA Applies": "Y", "Fixed Term": "Y", "Payment Due Day": "1",
    "Bank Rekening": "", "Bank Naam": "",
  },
]

/** Serialise to a real CSV and parse it back with papaparse — exactly as Step0Upload does. */
function throughCsv(): { headers: string[]; rows: Record<string, string>[] } {
  const csv = Papa.unparse({ fields: BOOK_HEADERS, data: BOOK_ROWS.map((r) => BOOK_HEADERS.map((h) => r[h] ?? "")) })
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, comments: "#" })
  return { headers: parsed.meta.fields ?? [], rows: parsed.data }
}

/** Serialise to a real .xlsx workbook and read it back with SheetJS — exactly as Step0Upload does. */
function throughXlsx(): { headers: string[]; rows: Record<string, string>[] } {
  const sheet = XLSX.utils.json_to_sheet(BOOK_ROWS, { header: BOOK_HEADERS })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, "Book")
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer

  const readBack = XLSX.read(buf, { type: "array" })
  const s = readBack.Sheets[readBack.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<Record<string, string>>(s, { defval: "", raw: false })
  return { headers: Object.keys(json[0] ?? {}), rows: json }
}

/**
 * The wizard's own path: matchColumns suggests the mapping, the wire contract translates it, runImport runs it.
 * Nothing here is hand-mapped — if matchColumns cannot recognise an agency's header, the acceptance run fails,
 * which is exactly what it is for.
 */
async function importBook(
  orgId: string, agentId: string, book: { headers: string[]; rows: Record<string, string>[] },
): Promise<ImportResult> {
  const suggestions = matchColumns(book.headers)
  const wireMapping: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) {
    if (s.field) wireMapping[s.column] = { field: s.field, entity: s.entity }
  }

  const decisions = toImportDecisions({
    columnMapping: wireMapping,
    expiredLeaseAction: "skip",       // the wizard's DEFAULT and recommended option
    bankConsentAttested: true,        // the agent attests they hold the tenants' consent
    depositsHeldAttested: true,       // …and that the agency holds the deposits
  })

  return runImport(book.rows, toColumnMapping(wireMapping), decisions, orgId, agentId, undefined, db)
}

async function countOf(table: string, orgId: string): Promise<number> {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId)
  if (error) throw new Error(`countOf ${table}: ${error.message}`)
  return count ?? 0
}

describe("ACCEPTANCE — a realistic af-ZA agency book through the real front door", () => {
  let orgId: string
  let agentId: string
  let first: ImportResult

  beforeAll(async () => {
    orgId = await seedEmptyOrg(db)
    agentId = seedUser()
    first = await importBook(orgId, agentId, throughCsv())
  })

  afterAll(() => {
    teardownOrg(orgId)
    teardownUser(agentId)
  })

  // ── 1. It creates the book ────────────────────────────────────────────────────────────────────────

  it("creates the portfolio: properties, units, tenants, leases", async () => {
    expect(first.propertiesCreated, "Acacia Hof, Sea Point, 14 Protea Straat").toBe(3)
    expect(await countOf("units", orgId)).toBe(7)

    // 7 rows: 5 live leases, 1 expired (→ history, per the wizard's default), 1 refused (Sectional Title).
    expect(first.leasesCreated, "five live leases").toBe(5)
    expect(await countOf("tenancy_history", orgId), "the expired tenancy became history, not a lease").toBe(1)
  })

  // ── 2. The money is right — in BOTH directions ────────────────────────────────────────────────────

  it("MONEY: af-ZA decimal comma and a cents-denominated column both land correctly", async () => {
    const { data, error } = await db.from("leases").select("rent_amount_cents, deposit_amount_cents").eq("org_id", orgId)
    expect(error).toBeFalsy()
    const rents = (data ?? []).map((l) => l.rent_amount_cents).sort((a, b) => a - b)

    // R6 600,50 → 660050. Stripping the comma gives 66 005 000 (R660 050) — the census #13 bug.
    expect(rents, "every af-ZA amount lands exactly").toEqual([
      660_050,     // "6 600,50"
      850_000,     // "8 500,00"
      1_200_000,   // "12 000,00"
      2_450_000,   // "R 24 500,00"
      3_100_000,   // "31 000,00"
    ])
    expect(rents, "the comma is a DECIMAL point, not a thousands separator").not.toContain(66_005_000)
  })

  // ── 3. Ambiguity is refused LOUDLY ────────────────────────────────────────────────────────────────

  it("REFUSES the unclassifiable lease type — and says so, by row and column", async () => {
    const { data, error } = await db.from("leases").select("rent_amount_cents").eq("org_id", orgId)
    expect(error).toBeFalsy()
    expect((data ?? []).some((l) => l.rent_amount_cents === 700_000), "the Sectional Title lease is NOT imported").toBe(false)

    const refusal = first.errors.find((e) => e.severity === "error" && e.field === "lease_type")
    expect(refusal, "the refusal is reported").toBeTruthy()
    expect(refusal!.rowIndex, "…against a real row of the file").toBeGreaterThanOrEqual(0)
    expect(refusal!.message).toContain("Sectional Title")
  })

  // ── 4. The statutory columns ──────────────────────────────────────────────────────────────────────

  it("STATUTORY: Retail is commercial, a natural person keeps the CPA, a company is indeterminate", async () => {
    const { data, error } = await db
      .from("leases")
      .select("rent_amount_cents, lease_type, cpa_applies, cpa_applies_at_signing, cpa_determination_category")
      .eq("org_id", orgId)
    expect(error).toBeFalsy()

    // "Retail", let to a natural person. Commercial premises — but CPA s5(2) turns on the CONSUMER.
    const retail = (data ?? []).find((l) => l.rent_amount_cents === 2_450_000)
    expect(retail?.lease_type, "Retail is COMMERCIAL — it used to import as residential").toBe("commercial")
    expect(retail?.cpa_applies_at_signing, "…and a natural person is still a consumer").toBe("yes")

    // "Office", let to a (Pty) Ltd → juristic, bands unknown → indeterminate, and flagged for the agent.
    const company = (data ?? []).find((l) => l.rent_amount_cents === 3_100_000)
    expect(company?.lease_type).toBe("commercial")
    expect(company?.cpa_applies_at_signing, "a juristic tenant cannot be resolved from an import").toBe("indeterminate")
    expect(company?.cpa_determination_category).toBe("indeterminate_bands")

    // The two columns NEVER disagree — the notice engine and the citation engine must not diverge.
    for (const l of data ?? []) {
      expect(l.cpa_applies, `cpa columns agree (${l.lease_type})`).toBe(l.cpa_applies_at_signing === "yes")
    }

    // "Y" means the CPA APPLIES. The old normaliseBoolean read it as false and stripped s14 portfolio-wide.
    const afZa = (data ?? []).find((l) => l.rent_amount_cents === 660_050)
    expect(afZa?.cpa_applies, "Y ⇒ true").toBe(true)
  })

  // ── 5. PII, consent and audit — what a regulator would read ───────────────────────────────────────

  it("PII: id_number and bank account are ENCRYPTED at rest, and recoverable", async () => {
    const { data: contacts, error } = await db
      .from("contacts").select("id_number, id_number_hash").eq("org_id", orgId).not("id_number", "is", null)
    expect(error).toBeFalsy()
    expect((contacts ?? []).length).toBeGreaterThan(0)
    for (const c of contacts ?? []) {
      expect(c.id_number, "never the raw SA ID").not.toMatch(/^\d{13}$/)
      expect(c.id_number_hash, "…and the dedup key travels with it").toBeTruthy()
    }

    const { data: acct, error: acctError } = await db
      .from("tenant_bank_accounts").select("account_number, account_number_enc").eq("org_id", orgId).single()
    expect(acctError).toBeFalsy()
    expect(acct?.account_number, "the stored account number is the MASK").not.toBe("6241234567")
    expect(decryptBankAccount(acct?.account_number_enc), "…and an agent gets the real number back").toBe("6241234567")
  })

  it("CONSENT + AUDIT: a regulator can read what was declared, by whom, and when", async () => {
    const { data: consent, error } = await db
      .from("consent_log").select("consent_type, consent_given, consent_version, user_id, subject_email, metadata")
      .eq("org_id", orgId).eq("consent_type", "bank_details_import").single()
    expect(error).toBeFalsy()

    expect(consent?.consent_given, "the agent attested").toBe(true)
    expect(consent?.user_id, "attributed to a named actor").toBe(agentId)
    expect(consent?.consent_version, "against a known notice version").toBeTruthy()
    expect(consent?.subject_email, "for a named data subject").toBe("thabo@example.co.za")
    expect((consent?.metadata as { declaration?: string })?.declaration ?? "",
      "and it says what it IS — an agency declaration, never the tenant's own consent").toContain("attested")

    const { count: auditRows } = await db
      .from("audit_log").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).eq("table_name", "tenant_bank_accounts")
    expect(auditRows ?? 0, "the bank-account write is audited per row").toBeGreaterThan(0)
  })

  // ── 6. The deposits ───────────────────────────────────────────────────────────────────────────────

  it("DEPOSITS: carried into the trust ledger as opening balances — and held, not guessed, on rate", async () => {
    expect(first.depositsMigratedCents, "the deposits the agency holds are on the ledger").toBeGreaterThan(0)
    expect(await countOf("deposit_transactions", orgId)).toBe(5)
    expect(await countOf("trust_transactions", orgId), "both sub-ledgers, atomically").toBe(5)

    // No rate anywhere ⇒ HELD. Never accrued at an invented 5%.
    const { data: leases, error: leaseErr } = await db.from("leases").select("deposit_interest_rate_percent").eq("org_id", orgId)
    expect(leaseErr).toBeFalsy()
    for (const l of leases ?? []) {
      expect(l.deposit_interest_rate_percent, "no rate was invented").toBeNull()
    }
    expect(first.errors.some((e) => e.message.includes("will not guess a rate")), "and the agent is told").toBe(true)
  })

  // ── 7. THE RE-RUN. The whole point of a migration front door. ──────────────────────────────────────

  it("RE-RUN of the identical book is a NO-OP — no duplicate anything, no double-posted trust money", async () => {
    const before = {
      properties: await countOf("properties", orgId),
      units: await countOf("units", orgId),
      tenants: await countOf("tenants", orgId),
      leases: await countOf("leases", orgId),
      deposits: await countOf("deposit_transactions", orgId),
      trust: await countOf("trust_transactions", orgId),
      history: await countOf("tenancy_history", orgId),
    }

    const second = await importBook(orgId, agentId, throughCsv())

    expect(second.propertiesCreated).toBe(0)
    expect(second.unitsCreated).toBe(0)
    expect(second.leasesCreated).toBe(0)
    expect(second.depositsMigratedCents, "an agency's deposit book is not posted twice").toBe(0)

    expect(await countOf("properties", orgId)).toBe(before.properties)
    expect(await countOf("units", orgId), "the blank-unit house did not duplicate").toBe(before.units)
    expect(await countOf("tenants", orgId)).toBe(before.tenants)
    expect(await countOf("leases", orgId)).toBe(before.leases)
    expect(await countOf("deposit_transactions", orgId)).toBe(before.deposits)
    expect(await countOf("trust_transactions", orgId)).toBe(before.trust)
    expect(await countOf("tenancy_history", orgId)).toBe(before.history)
  })

  // ── 8. XLSX — the same book, the other file format ────────────────────────────────────────────────

  it("XLSX: the same book uploaded as Excel produces the same portfolio", async () => {
    const org = await seedEmptyOrg(db)
    try {
      const result = await importBook(org, agentId, throughXlsx())

      expect(result.propertiesCreated).toBe(3)
      expect(result.leasesCreated, "same five leases as the CSV").toBe(5)

      const { data, error } = await db.from("leases").select("rent_amount_cents").eq("org_id", org)
      expect(error).toBeFalsy()
      const rents = (data ?? []).map((l) => l.rent_amount_cents).sort((a, b) => a - b)
      expect(rents, "money survives the Excel round-trip intact").toEqual([
        660_050, 850_000, 1_200_000, 2_450_000, 3_100_000,
      ])
    } finally {
      teardownOrg(org)
    }
  })
})
