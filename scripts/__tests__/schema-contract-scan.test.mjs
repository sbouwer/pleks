/**
 * scripts/__tests__/schema-contract-scan.test.mjs — regression-guards the select parser of the unified
 * schema-contract scanner (ADDENDUM_SCHEMA_CONTRACT_SCREEN). Drives the pure parser against a tiny
 * fixture manifest, including the exact org-branding drift shape that motivated the original guard.
 */
import { describe, it, expect } from "vitest"
import { Project, Node, SyntaxKind } from "ts-morph"
import { validateSelectText, splitTopLevel, criticality, scanSourceFiles } from "../schema-contract-scan.mjs"

const tbl = {
  organisations: ["id", "name", "addr_line1", "addr_city", "brand_logo_path"],
  units: ["id", "unit_number", "property_id"],
  properties: ["id", "name"],
}

describe("schema-contract select parser", () => {
  it("passes a select of real columns", () => {
    expect(validateSelectText("organisations", "id, name, addr_line1", tbl).violations).toEqual([])
  })

  it("flags phantom columns — the actual org-branding drift shape", () => {
    const r = validateSelectText("organisations", "name, brand_logo_url, address_line1, city", tbl)
    expect(r.violations).toEqual([
      { table: "organisations", col: "brand_logo_url" },
      { table: "organisations", col: "address_line1" },
      { table: "organisations", col: "city" },
    ])
  })

  it("validates the real column behind an alias", () => {
    expect(validateSelectText("organisations", "logo:brand_logo_path", tbl).violations).toEqual([])
    expect(validateSelectText("organisations", "logo:brand_logo_url", tbl).violations)
      .toEqual([{ table: "organisations", col: "brand_logo_url" }])
  })

  it("recurses into embeds and flags wrong embed columns", () => {
    const r = validateSelectText("units", "unit_number, properties(name, nope)", tbl)
    expect(r.violations).toEqual([{ table: "properties", col: "nope" }])
  })

  it("resolves FK-hinted / aliased embed target tables", () => {
    expect(validateSelectText("units", "prop:properties!some_fk(name)", tbl).violations).toEqual([])
  })

  it("skips *, casts, and json paths (never false-fails)", () => {
    expect(validateSelectText("organisations", "id, name::text, addr_city->>'x', *", tbl).violations).toEqual([])
  })

  it("warns (does not fail) on an embed relation absent from the manifest", () => {
    const r = validateSelectText("units", "unknown_rel(foo)", tbl)
    expect(r.violations).toEqual([])
    expect([...r.unknownTables]).toContain("unknown_rel")
  })

  it("splitTopLevel respects embed parentheses", () => {
    expect(splitTopLevel("a, b(c, d), e")).toEqual(["a", "b(c, d)", "e"])
  })

  it("tags POPIA/money tables CRITICAL, access HIGH, rest NORMAL", () => {
    expect(criticality("consent_log")).toBe("CRITICAL")
    expect(criticality("trust_transactions")).toBe("CRITICAL")   // prefix
    expect(criticality("user_orgs")).toBe("HIGH")
    expect(criticality("inspections")).toBe("NORMAL")
  })
})

/**
 * Per-matcher canary (ADDENDUM_SCHEMA_CONTRACT_SCREEN D-7). Every matcher gets one deliberately-wrong
 * example here; each test asserts that matcher still fires. The whole point: when a refactor breaks a
 * seam (as the {table,sawFrom} change silently killed the cardinality matcher), the dead matcher fails
 * its own canary instead of quietly reporting 0 while the run stays green. A new matcher MUST add a
 * canary line here.
 */
describe("per-matcher canary — each matcher fires on a deliberately-wrong fixture", () => {
  const TABLES = { widgets: ["id", "name"], consent_log: ["id", "org_id"] }  // consent_log is CRITICAL (§4)
  const RPCS = { do_thing: ["p_id"] }
  const FIXTURE = `
    declare const db: any
    export async function f() {
      await db.from("widgets").select("id, nope")                            // select: phantom column
      await db.from("widgets").select("id").eq("ghost", 1)                   // filter: phantom column
      await db.from("widgets").insert({ phantom_key: 1 })                    // write:  phantom key
      await db.from("ghost_table").select("id")                              // relation: phantom .from()
      await db.rpc("do_thing", { bad_arg: 1 })                               // rpc: wrong arg name
      await db.rpc("ghost_fn", { p_id: 1 })                                  // rpc-missing: phantom fn
      await db.from("widgets").select("id").eq("created::date", 1)           // cast: :: in a filter column
      await db.from("widgets").select("id").order("name").limit(1).single()  // cardinality (warn)
      db.from("consent_log").insert({ org_id: 1 }).then(() => null)          // swallow: best-effort CRITICAL write
      let q = db.from("widgets").select("id")
      q = q.eq("phantom_via_binding", 1)                                     // binding resolution (builder pattern)
    }
    async function genericHelper(t: "widgets" | "consent_log") {
      await db.from(t).select("id, nope_union")                              // union resolution: validate each member
    }
  `
  const project = new Project({ useInMemoryFileSystem: true })
  project.createSourceFile("fixture.ts", FIXTURE)
  const { findings } = scanSourceFiles(project.getSourceFiles(), TABLES, RPCS, Node, SyntaxKind)
  const has = (kind, name) => findings.some((f) => f.kind === kind && (name === undefined || f.detail === name || f.table === name))

  it("select fires on a phantom column", () => expect(has("select", "nope")).toBe(true))
  it("filter fires on a phantom column", () => expect(has("filter", "ghost")).toBe(true))
  it("write fires on a phantom insert key", () => expect(has("write", "phantom_key")).toBe(true))
  it("relation fires on a phantom .from() table", () => expect(has("relation", "ghost_table")).toBe(true))
  it("rpc fires on a wrong arg name", () => expect(has("rpc", "bad_arg")).toBe(true))
  it("rpc-missing fires on a non-existent function", () => expect(has("rpc-missing", "ghost_fn")).toBe(true))
  it("cast fires on :: in a filter column", () => expect(has("cast")).toBe(true))
  it("cardinality warns on .single() after order/limit", () =>
    expect(findings.some((f) => f.kind === "cardinality" && f.severity === "warn")).toBe(true))
  it("swallow fires on a best-effort CRITICAL write", () => expect(has("swallow")).toBe(true))
  it("binding resolution finds the builder-pattern phantom (the regression that went dead)", () =>
    expect(has("filter", "phantom_via_binding")).toBe(true))
  it("union resolution validates a string-literal-union .from(table) against each member", () =>
    expect(has("select", "nope_union")).toBe(true))
})
