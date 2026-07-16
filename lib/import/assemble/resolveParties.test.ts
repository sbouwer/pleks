/**
 * lib/import/assemble/resolveParties.test.ts — a lease never gets the wrong tenant (ADDENDUM_21C D-3)
 *
 * Notes:  The catastrophic error is a wrong lease↔party attachment. These pin the two guarantees: a deterministic
 *         id match resolves, and EVERYTHING fuzzy holds — a name+phone match, even a perfect one, is 0.90 and so
 *         must NEVER auto-attach (it is surfaced for a human, not acted on). If that invariant ever broke, the
 *         first test below would flip from "held" to "resolved".
 */
import { describe, it, expect } from "vitest"
import { resolvePartyByJunction, resolvePartyFuzzy, type StagedContact } from "./resolveParties"

const CONTACTS: StagedContact[] = [
  { ref: "TEN000001", name: "Donovan Edward Farao", phone: "0719780357", email: "donnie@farao.co.za" },
  { ref: "TEN000002", name: "Apphia Farao", phone: "0821112222", email: "apphia@farao.co.za" },
  { ref: "TEN000003", name: "Stéan Bouwer", phone: "0719780357", email: "stean@b.co.za" }, // SHARES a phone
]

describe("resolvePartyByJunction — deterministic by ID (D-2)", () => {
  const byRef = new Map(CONTACTS.map((c) => [c.ref.replace(/0+(\d)/, "$1").toUpperCase(), c]))
  it("attaches the party when the id exists", () => {
    const map = new Map([["TEN1", CONTACTS[0]!]])
    const r = resolvePartyByJunction("LEA000001", "TEN000001", map, "tenant")
    expect(r).toEqual({ status: "resolved", ref: "TEN000001" })
    void byRef
  })
  it("HOLDS a dangling id — never silently drops it (D-4)", () => {
    const r = resolvePartyByJunction("LEA000009", "TEN999999", new Map(), "tenant")
    expect(r.status).toBe("held")
    if (r.status === "held") expect(r.hold.kind).toBe("reference")
  })
})

describe("resolvePartyFuzzy — surfaces candidates, NEVER auto-attaches (D-3/D-7)", () => {
  it("a PERFECT name+phone match is still HELD, not resolved (0.90 < AUTO_LINK)", () => {
    const r = resolvePartyFuzzy("LEA000001", "Donovan Edward Farao (0719780357)", "tenant", CONTACTS)
    // The invariant. If the band ever auto-attached, this is "resolved" and the test fails loudly.
    expect(r.status).toBe("held")
    if (r.status === "held") {
      expect(r.hold.kind).toBe("fuzzy")
      expect(r.hold.candidates?.[0]).toMatchObject({ ref: "TEN000001", confidence: 0.9 })
      expect(r.hold.decisions).toContain("confirm_fuzzy")
    }
  })

  it("a phone-only near-miss (household name, shared line) is a WEAKER candidate — surfaced, still held", () => {
    // "Family Farao" matches nobody by name; the phone 0719780357 matches TWO contacts (a shared line). Both are
    // surfaced as phone-only candidates so the human can pick — the assembler refuses to choose.
    const r = resolvePartyFuzzy("LEA000001", "Family Farao (0719780357)", "tenant", CONTACTS)
    expect(r.status).toBe("held")
    if (r.status === "held") {
      expect(r.hold.kind).toBe("fuzzy")
      expect(r.hold.candidates).toHaveLength(2) // TEN000001 + TEN000003 share the phone
      expect(r.hold.candidates?.every((c) => c.confidence === 0.6)).toBe(true)
    }
  })

  it("no match at all → a reference hold that names the missing junction report", () => {
    const r = resolvePartyFuzzy("LEA000002", "Unknown Tenant (0000000000)", "tenant", CONTACTS)
    expect(r.status).toBe("held")
    if (r.status === "held") {
      expect(r.hold.kind).toBe("reference")
      expect(r.hold.candidates).toBeUndefined()
      expect(r.hold.reason).toMatch(/lease-detail report|contact list/i)
    }
  })
})
