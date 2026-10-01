/**
 * app/api/admin/searchworx-rates/import/__tests__/route.test.ts — the admin price-list upload (ADDENDUM_14V §3.2a)
 *
 * Notes:  Probed both ways: an admin upload writes observations AND one audit_log row under PLATFORM_ORG_ID
 *         whose record_id is the import id stamped on the observations; a non-admin writes nothing; a list
 *         with a rejected line writes nothing and is not audited as an import.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

let admin = true
const inserts: Record<string, Record<string, unknown>[]> = {}

vi.mock("@/lib/admin/auth", () => ({ isAdminAuthenticated: async () => admin }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({
    from: (t: string) => ({
      insert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        inserts[t] = [...(inserts[t] ?? []), ...(Array.isArray(rows) ? rows : [rows])]
        return { error: null }
      },
    }),
  }),
}))

import { POST } from "../route"
import { PLATFORM_ORG_ID } from "@/lib/comms/platform-org"

const CSV = readFileSync(join(__dirname, "../../../../../../lib/searchworx/rates/__fixtures__/pricelist_default_2026-10-01.csv"), "utf8")

const post = (body: unknown) =>
  POST(new NextRequest("https://x/api/admin/searchworx-rates/import", { method: "POST", body: JSON.stringify(body) }))

beforeEach(() => {
  admin = true
  for (const k of Object.keys(inserts)) delete inserts[k]
})

describe("POST /api/admin/searchworx-rates/import", () => {
  it("records observations and audits the import under PLATFORM_ORG_ID, record_id = the import id", async () => {
    const res = await post({ filename: "pricelist_default_2026-10-01.csv", csv: CSV, vendor_effective_date: "2026-10-01" })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, recorded: 7 })
    const obs = inserts.searchworx_rate_observations
    expect(obs).toHaveLength(7)
    expect(inserts.audit_log).toHaveLength(1)
    const audit = inserts.audit_log[0]
    expect(audit.org_id).toBe(PLATFORM_ORG_ID)
    expect(audit.table_name).toBe("searchworx_rate_observations")
    const importId = (obs[0].raw as Record<string, unknown>).import_id
    expect(importId).toBeTruthy()
    expect(audit.record_id).toBe(importId)
    expect(new Set(obs.map((o) => (o.raw as Record<string, unknown>).import_id))).toEqual(new Set([importId]))
  })

  it("PLANTED: a non-admin is refused and nothing is written", async () => {
    admin = false
    const res = await post({ filename: "f.csv", csv: CSV, vendor_effective_date: "2026-10-01" })
    expect(res.status).toBe(401)
    expect(inserts).toEqual({})
  })

  it("PLANTED: a list with a rejected line is 422 — no observations, no import audit", async () => {
    const res = await post({ filename: "f.csv", csv: CSV.replace("CIPC COMPANY,17.70", "CIPC COMPANY,seventeen"), vendor_effective_date: "2026-10-01" })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ ok: false, reason: "rejected_lines" })
    expect(inserts).toEqual({})
  })

  it.each([
    [{ csv: CSV, vendor_effective_date: "2026-10-01" }],
    [{ filename: "f.csv", vendor_effective_date: "2026-10-01" }],
    [{ filename: "f.csv", csv: CSV, vendor_effective_date: "01/10/2026" }],
  ])("a malformed body is 400 and writes nothing", async (body) => {
    expect((await post(body)).status).toBe(400)
    expect(inserts).toEqual({})
  })
})
