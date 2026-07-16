/**
 * lib/import/assemble/classify.test.ts — each MRI report is placed by prefix + signature (ADDENDUM_21C D-5)
 *
 * Notes:  The classifications mirror museum/ORACLE.md's report table. The load-bearing one is that a keyless
 *         GL/control ledger is NOT mistaken for an import source, and a contacts table (mixed party prefixes) is
 *         recognised by TYPE + IDENTIFIER rather than by a single namespace.
 */
import { describe, it, expect } from "vitest"
import { classifyTable } from "./classify"

const rows = (ref: string[]) => ref.map((r) => ({ REFERENCE: r }))

describe("classifyTable — the MRI report shapes", () => {
  it("lease spine: LEA key + rental/status columns", () => {
    const c = classifyTable({ headers: ["REFERENCE", "PROPERTY NAME", "RENTAL AMOUNT", "LEASE STATUS"], rows: rows(["LEA000001"]) })
    expect(c).toMatchObject({ kind: "lease", keyPrefix: "LEA", confidence: "high" })
  })

  it("deposit: LEA key + held/required columns", () => {
    const c = classifyTable({ headers: ["REFERENCE", "STATE", "REQUIRED", "HELD"], rows: rows(["LEA000001"]) })
    expect(c.kind).toBe("deposit")
  })

  it("lease_parties: LEA key + TENANTS/LANDLORD columns", () => {
    const c = classifyTable({ headers: ["REFERENCE", "PROPERTY", "LANDLORD", "TENANTS"], rows: rows(["LEA000001"]) })
    expect(c.kind).toBe("lease_parties")
  })

  it("property: PRO namespace", () => {
    const c = classifyTable({ headers: ["REFERENCE", "PROPERTY", "STATE"], rows: rows(["PRO000001"]) })
    expect(c).toMatchObject({ kind: "property", keyPrefix: "PRO" })
  })

  it("contacts: TYPE + IDENTIFIER, mixed party prefixes", () => {
    const c = classifyTable({
      headers: ["REFERENCE", "TYPE", "IDENTIFIER", "FIRST NAMES"],
      rows: rows(["TEN000001", "ONR000001", "SUP000001", "AGT000001"]),
    })
    expect(c.kind).toBe("contact")
  })

  it("reference-only: a keyless DEBIT/CREDIT ledger is NOT an import source", () => {
    const c = classifyTable({ headers: ["DATE", "DESCRIPTION", "DEBIT", "CREDIT", "BALANCE"], rows: [{}] })
    expect(c.kind).toBe("reference_only")
  })

  it("unclassified: a keyless table with no ledger signature", () => {
    const c = classifyTable({ headers: ["Notes", "Misc"], rows: [{}] })
    expect(c.kind).toBe("unclassified")
  })
})
