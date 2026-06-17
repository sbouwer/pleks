import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveOrgCorrespondenceHtml } from "./orgTemplateOverride"
import type { OrgBranding } from "./templates/layout"

// Minimal Supabase query-builder mock: every chained method returns the builder; maybeSingle resolves.
function mockDb(result: { data: unknown; error: unknown }): SupabaseClient {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "not", "limit"]) builder[m] = () => builder
  builder.maybeSingle = async () => result
  return { from: () => builder } as unknown as SupabaseClient
}

const branding = { orgName: "Test Agency" } as OrgBranding

describe("resolveOrgCorrespondenceHtml (BUILD_70 Phase 2b override gating)", () => {
  it("returns null when the org has no customised template for the key", async () => {
    const html = await resolveOrgCorrespondenceHtml(mockDb({ data: null, error: null }), "org", "rent.invoice_issued", {}, branding)
    expect(html).toBeNull()
  })

  it("NEVER overrides a statutory template (the compliance floor)", async () => {
    const html = await resolveOrgCorrespondenceHtml(
      mockDb({ data: { body_html: "<p>x</p>", comms_class: "statutory" }, error: null }),
      "org", "arrears.letter_of_demand", { name: "Jane" }, branding)
    expect(html).toBeNull()
  })

  it("returns null on a query error (fail safe to the React-Email default)", async () => {
    const html = await resolveOrgCorrespondenceHtml(mockDb({ data: null, error: { message: "boom" } }), "org", "k", {}, branding)
    expect(html).toBeNull()
  })

  it("renders the org body with {{tokens}} resolved when a correspondence override exists", async () => {
    const html = await resolveOrgCorrespondenceHtml(
      mockDb({ data: { body_html: "<p>Dear {{name}}, your rent is {{amount}}.</p>", comms_class: "correspondence" }, error: null }),
      "org", "rent.invoice_issued", { name: "Jane Smith", amount: "R 12 500" }, branding)
    expect(html).toBeTypeOf("string")
    expect(html).toContain("Dear Jane Smith")
    expect(html).toContain("R 12 500")
  })
})
