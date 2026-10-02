/**
 * app/api/admin/searchworx-rate/__tests__/route.test.ts — apply / reject a held Searchworx price (ADDENDUM_14V §3.3 step 4)
 *
 * Notes:  Probed both ways against fakeRateDb: APPLY writes one admin_override rate at the held value, links it,
 *         and audits under PLATFORM_ORG_ID; REJECT writes no rate; a non-admin, a bad body, a missing hold and an
 *         already-decided hold write nothing; a same-day override collision (23505) is 409 and RELEASES the
 *         claim, so the hold can still be decided.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { fakeRateDb, type Row } from "@/lib/searchworx/rates/__tests__/fakeRateDb"

let admin = true
let fake = fakeRateDb()

vi.mock("@/lib/admin/auth", () => ({ isAdminAuthenticated: async () => admin }))
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => fake.db }))
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), saTodayISO: () => "2026-10-02" }))

import { GET, POST } from "../route"
import { PLATFORM_ORG_ID } from "@/lib/comms/platform-org"

const hold = (over: Row = {}): Row => ({
  id: "hold-1",
  product_key: "vccb",
  held_cents: 900,
  current_cents: 635,
  observation_id: "obs-9",
  status: "held",
  first_held_at: "2026-10-02T03:00:00.000Z",
  ...over,
})

const post = (body: unknown) =>
  POST(new NextRequest("https://x/api/admin/searchworx-rate", { method: "POST", body: JSON.stringify(body) }))

beforeEach(() => {
  admin = true
  fake = fakeRateDb({ searchworx_rate_holds: [hold()] })
})

describe("POST /api/admin/searchworx-rate", () => {
  it("APPLY writes one admin_override at the held value, links it, and audits under PLATFORM_ORG_ID", async () => {
    const res = await post({ hold_id: "hold-1", decision: "apply", note: "confirmed with Searchworx" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(fake.tables.searchworx_rates).toEqual([
      expect.objectContaining({ product_key: "vccb", cost_excl_vat_cents: 900, source: "admin_override", effective_date: "2026-10-02", observation_id: "obs-9" }),
    ])
    const rateId = fake.tables.searchworx_rates[0].id
    expect(body).toMatchObject({ ok: true, status: "applied", rate_id: rateId })
    expect(fake.tables.searchworx_rate_holds[0]).toMatchObject({ status: "applied", rate_id: rateId, decision_note: "confirmed with Searchworx" })
    expect(fake.tables.audit_log).toHaveLength(1)
    expect(fake.tables.audit_log[0]).toMatchObject({ org_id: PLATFORM_ORG_ID, table_name: "searchworx_rate_holds", record_id: "hold-1" })
  })

  it("REJECT writes no rate, marks the hold rejected, and audits", async () => {
    const res = await post({ hold_id: "hold-1", decision: "reject" })
    expect(res.status).toBe(200)
    expect(fake.tables.searchworx_rates).toEqual([])
    expect(fake.tables.searchworx_rate_holds[0].status).toBe("rejected")
    expect(fake.tables.audit_log).toHaveLength(1)
  })

  it("PLANTED: a non-admin is refused and nothing is written", async () => {
    admin = false
    expect((await post({ hold_id: "hold-1", decision: "apply" })).status).toBe(401)
    expect(fake.tables.searchworx_rates).toEqual([])
    expect(fake.tables.searchworx_rate_holds[0].status).toBe("held")
    expect(fake.tables.audit_log).toEqual([])
  })

  it("PLANTED: a bad body is 400, a missing hold 404 — nothing written", async () => {
    expect((await post({ hold_id: "hold-1", decision: "maybe" })).status).toBe(400)
    expect((await post({ decision: "apply" })).status).toBe(400)
    expect((await post({ hold_id: "nope", decision: "apply" })).status).toBe(404)
    expect(fake.tables.searchworx_rates).toEqual([])
    expect(fake.tables.audit_log).toEqual([])
  })

  it("PLANTED: an already-decided hold is 409 and is not decided twice", async () => {
    fake = fakeRateDb({ searchworx_rate_holds: [hold({ status: "rejected" })] })
    expect((await post({ hold_id: "hold-1", decision: "apply" })).status).toBe(409)
    expect(fake.tables.searchworx_rates).toEqual([])
    expect(fake.tables.searchworx_rate_holds[0].status).toBe("rejected")
    expect(fake.tables.audit_log).toEqual([])
  })

  it("a same-day override collision is 409 and RELEASES the claim — the hold stays decidable", async () => {
    fake = fakeRateDb({
      searchworx_rate_holds: [hold()],
      searchworx_rates: [{ product_key: "vccb", cost_excl_vat_cents: 700, effective_date: "2026-10-02", source: "admin_override" }],
    })
    expect((await post({ hold_id: "hold-1", decision: "apply" })).status).toBe(409)
    expect(fake.tables.searchworx_rate_holds[0]).toMatchObject({ status: "held", decided_at: null })
    expect(fake.tables.searchworx_rates).toHaveLength(1)
    expect(fake.tables.audit_log).toEqual([])
  })

  it("any other rate insert failure is 500 and also releases the claim", async () => {
    fake = fakeRateDb({ searchworx_rate_holds: [hold()] }, { searchworx_rates: { code: "42501", message: "denied" } })
    expect((await post({ hold_id: "hold-1", decision: "apply" })).status).toBe(500)
    expect(fake.tables.searchworx_rate_holds[0].status).toBe("held")
    expect(fake.tables.audit_log).toEqual([])
  })
})

describe("GET /api/admin/searchworx-rate", () => {
  it("lists only holds still awaiting a decision", async () => {
    fake = fakeRateDb({ searchworx_rate_holds: [hold(), hold({ id: "hold-2", status: "applied" })] })
    const res = await GET()
    expect((await res.json()).holds.map((h: Row) => h.id)).toEqual(["hold-1"])
  })

  it("PLANTED: a non-admin is refused", async () => {
    admin = false
    expect((await GET()).status).toBe(401)
  })
})
