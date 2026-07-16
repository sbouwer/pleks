/**
 * lib/import/assemble/assemble.test.ts — a report SET becomes the importer's book, or is honestly held
 *
 * Notes:  End-to-end over the assembler (ADDENDUM_21C §6). The two shapes that matter: a set WITH a junction
 *         report (lease→party by ID) assembles deterministically; the real-MRI shape (party is a name string, no
 *         junction) HOLDS every party edge — no lease imports with a guessed tenant — and `resolved + held = total`
 *         holds throughout. The never-mis-join probe: namespaced keys (D-5/D-6) keep a LEA and a TEN that share a
 *         number from ever crossing.
 */
import { describe, it, expect } from "vitest"
import { assemble } from "./assemble"
import type { StagedTable } from "./types"

function table(kind: StagedTable["kind"], headers: string[], rows: Record<string, string>[]): StagedTable {
  return { name: kind, headers, rows, kind, keyColumn: headers.includes("REFERENCE") ? "REFERENCE" : undefined }
}

const leaseTable = table("lease", ["REFERENCE", "PROPERTY NAME", "START DATE", "END DATE", "RENTAL AMOUNT"], [
  { REFERENCE: "LEA000001", "PROPERTY NAME": "Twin Peaks", "START DATE": "2023/04/01", "END DATE": "2026/03/31", "RENTAL AMOUNT": "8860" },
])
const propertyTable = table("property", ["REFERENCE", "PROPERTY", "STATE"], [{ REFERENCE: "PRO000001", PROPERTY: "Twin Peaks", STATE: "Active" }])
const depositTable = table("deposit", ["REFERENCE", "HELD"], [{ REFERENCE: "LEA000001", HELD: "17720" }])
const contactTable = table("contact", ["REFERENCE", "TYPE", "FIRST NAMES", "SURNAME", "IDENTIFIER", "EMAIL", "NUMBERS"], [
  { REFERENCE: "TEN000001", TYPE: "tenant", "FIRST NAMES": "Donovan", SURNAME: "Farao", IDENTIFIER: "8509135105080", EMAIL: "donnie@farao.co.za", NUMBERS: "0719780357" },
  { REFERENCE: "ONR000001", TYPE: "landlord", "FIRST NAMES": "Johan", SURNAME: "Bouwer", IDENTIFIER: "", EMAIL: "johan@own.co.za", NUMBERS: "0821112222" },
  { REFERENCE: "SUP000001", TYPE: "vendor", "FIRST NAMES": "", SURNAME: "", IDENTIFIER: "", EMAIL: "dw@plumb.co.za", NUMBERS: "0111112222" },
])

describe("assemble — a junction report resolves the lease→party edges deterministically (D-2)", () => {
  const junction = table("lease_parties", ["REFERENCE", "TENANTS", "LANDLORD"], [
    { REFERENCE: "LEA000001", TENANTS: "TEN000001", LANDLORD: "ONR000001" },
  ])
  const book = assemble([leaseTable, propertyTable, depositTable, contactTable, junction])

  it("emits one denormalised lease row carrying the resolved tenant + owner, money in CENTS", () => {
    const leaseRows = book.rows.filter((r) => r.__entity_type === "")
    expect(leaseRows).toHaveLength(1)
    expect(leaseRows[0]).toMatchObject({
      property_name: "Twin Peaks",
      first_name: "Donovan",
      id_number: "8509135105080",
      owner_email: "johan@own.co.za",
      rent_amount_cents: "886000", // 8860 rands → cents; NOT 8860 (the F-8 100× trap)
      deposit_amount_cents: "1772000",
    })
    expect(book.ledger).toMatchObject({ resolved: 2, held: 0, total: 2 })
  })

  it("the vendor (on no lease) still imports standalone, so no identity is lost", () => {
    const vendor = book.rows.find((r) => r.__entity_type === "vendor")
    expect(vendor?.email).toBe("dw@plumb.co.za")
  })

  it("never mis-joins across namespaces: the tenant edge TEN000001 resolves the TENANT, not a same-numbered lease", () => {
    const leaseRow = book.rows.find((r) => r.__entity_type === "")
    expect(leaseRow?.first_name).toBe("Donovan") // TEN000001, never LEA000001 despite the shared "000001"
  })
})

describe("assemble — the real-MRI shape (name strings, no junction) HOLDS every party (D-3/D-7)", () => {
  const parties = table("lease_parties", ["REFERENCE", "TENANTS", "LANDLORD"], [
    { REFERENCE: "LEA000001", TENANTS: "Family Farao (0719780357)", LANDLORD: "Someone Unknown" },
  ])
  const book = assemble([leaseTable, propertyTable, depositTable, contactTable, parties])

  it("emits NO lease row — a lease is never imported with a guessed tenant", () => {
    expect(book.rows.filter((r) => r.__entity_type === "")).toHaveLength(0)
  })

  it("holds both party edges, and resolved + held = total (report-honesty, D-4)", () => {
    expect(book.ledger.resolved).toBe(0)
    expect(book.ledger.held).toBe(2)
    expect(book.ledger.resolved + book.ledger.held).toBe(book.ledger.total)
    // the tenant hold is fuzzy (a phone-only candidate exists); the landlord hold is a bare reference (no match)
    expect(book.ledger.holds.map((h) => h.kind).sort()).toEqual(["fuzzy", "reference"])
  })

  it("still imports the contacts standalone — the identity master lands even when leases hold", () => {
    expect(book.rows.filter((r) => r.__entity_type === "tenant")).toHaveLength(1)
    expect(book.rows.filter((r) => r.__entity_type === "landlord")).toHaveLength(1)
  })
})

describe("assemble — the manifest names what's missing (D-2)", () => {
  it("reports a missing required table without crashing", () => {
    const book = assemble([leaseTable, contactTable]) // no property table
    expect(book.ledger.missingRequired).toContain("property")
  })
})
