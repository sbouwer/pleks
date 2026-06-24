/**
 * lib/help/__tests__/help-data.test.ts — Help corpus integrity + role-scoping (BUILD_68)
 *
 * Guards the load-bearing model: role-scoping is real (D-HELP-02), categories are valid and
 * ordered (D-HELP-15), and no answer carries an unresolved {{token}} or a hardcoded fee/URL
 * (must derive from lib/constants — feedback_no_hardcoded_values).
 */
import { describe, it, expect } from "vitest"
import {
  HELP_ENTRIES, HELP_CATEGORIES, HELP_ROLES, ALL_ROLES,
  entriesForRole, categoriesForRole, type HelpRole,
} from "@/lib/help/help-data"
import { APPLICATION_FEE_CENTS, formatZAR } from "@/lib/constants"

const CATEGORY_IDS = new Set(HELP_CATEGORIES.map((c) => c.id))
const ROLE_IDS = new Set<HelpRole>(HELP_ROLES.map((r) => r.id))
const ID_SET = new Set(HELP_ENTRIES.map((e) => e.id))
// Anchor a negative role-scoping assertion on a REAL entry id: if it's renamed/deleted, ".some(id === X) === false"
// would pass vacuously (the entry it meant to exclude no longer exists). This fails the rename instead.
const realId = (id: string) => { expect(ID_SET.has(id), `help entry "${id}" no longer exists — the role-scoping assertion below would pass vacuously`).toBe(true); return id }

describe("help corpus integrity", () => {
  it("has entries and unique ids", () => {
    expect(HELP_ENTRIES.length).toBeGreaterThan(20)
    const ids = HELP_ENTRIES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("every entry has a valid category and at least one valid role", () => {
    for (const e of HELP_ENTRIES) {
      expect(CATEGORY_IDS.has(e.category), `${e.id} category`).toBe(true)
      expect(e.roles.length).toBeGreaterThan(0)
      for (const r of e.roles) expect(ROLE_IDS.has(r), `${e.id} role ${r}`).toBe(true)
      expect(e.q.length).toBeGreaterThan(0)
      expect(e.a.length).toBeGreaterThan(0)
    }
  })

  it("no answer carries an unresolved {{token}} (all interpolated from the SSOT)", () => {
    for (const e of HELP_ENTRIES) {
      expect(e.a.includes("{{"), `${e.id} has an unresolved token`).toBe(false)
    }
  })

  it("the application-fee answer is derived from lib/constants, not hardcoded", () => {
    const fee = HELP_ENTRIES.find((e) => e.id === "q-applications-fee")
    expect(fee?.a).toContain(formatZAR(APPLICATION_FEE_CENTS))
  })
})

describe("role-scoping (D-HELP-02)", () => {
  it("an agent sees agent + general entries, not tenant-only ones", () => {
    const agent = entriesForRole("agent")
    expect(agent.some((e) => e.category === "trust")).toBe(true)       // agent-only topic present
    expect(agent.some((e) => e.roles.includes("agent"))).toBe(true)
    // a tenant-only entry must not appear for an agent (anchored on the entry actually existing)
    expect(agent.some((e) => e.id === realId("q-payments-pay-t"))).toBe(false)
  })

  it("a tenant does not see agent-only entries", () => {
    const tenant = entriesForRole("tenant")
    expect(tenant.some((e) => e.id === realId("q-trust-holds-money"))).toBe(false)
    expect(tenant.some((e) => e.id === "q-payments-pay-t")).toBe(true)
  })

  it("general (all-role) entries appear for every role", () => {
    for (const role of ALL_ROLES) {
      expect(entriesForRole(role).some((e) => e.id === "q-account-signin")).toBe(true)
    }
  })

  it("categoriesForRole returns only non-empty categories, in HELP_CATEGORIES order", () => {
    const cats = categoriesForRole("supplier")
    expect(cats.length).toBeGreaterThan(0)
    // every returned category actually has a supplier entry
    for (const c of cats) {
      expect(entriesForRole("supplier").some((e) => e.category === c.id)).toBe(true)
    }
    // ordering matches the master order
    const masterOrder = HELP_CATEGORIES.map((c) => c.id)
    const idx = cats.map((c) => masterOrder.indexOf(c.id))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })
})
