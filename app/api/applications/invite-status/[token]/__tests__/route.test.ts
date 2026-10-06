/**
 * app/api/applications/invite-status/[token]/__tests__/route.test.ts — A12: the lead's tracker reads its own status
 *
 * Notes:  Probed both ways. A live shortlist_invite token returns the tracker fields; a token of the wrong type, an
 *         unknown or expired token, and a deleted or purged application return nothing the page could render as
 *         "paid". feePaid follows the ITN's stamp (fee_paid_at) or the older fee_status flag, and is false until then.
 *         A read error is a 503, never a not-found.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let failTable: string | null = null

function fakeDb() {
  return {
    from(table: string) {
      const filters: [string, unknown][] = []
      const notNull: string[] = []
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return b },
        not: (c: string) => { notNull.push(c); return b },
        limit: () => b,
        maybeSingle: async () => {
          if (failTable === table) return { data: null, error: { message: "boom" } }
          const hit = (tables[table] ?? []).find((r) =>
            filters.every(([c, v]) => r[c] === v) && notNull.every((c) => r[c] != null))
          return { data: hit ?? null, error: null }
        },
      }
      return b
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => fakeDb() }))

import { GET } from "../route"

const call = async (token: string) => {
  const res = await GET(new Request("https://x"), { params: Promise.resolve({ token }) })
  return { status: res.status, body: await res.json() as Row }
}

const app = (over: Row = {}): Row => ({
  id: "app-1", org_id: "org-1", stage2_status: "pending_payment", fee_status: null, fee_paid_at: null, fee_amount_cents: 25000,
  deleted_at: null, pii_purged_at: null, ...over,
})

beforeEach(() => {
  failTable = null
  tables = {
    application_tokens: [
      { token: "tok", token_type: "shortlist_invite", application_id: "app-1", expires_at: "2099-01-01T00:00:00Z" },
      { token: "old", token_type: "shortlist_invite", application_id: "app-1", expires_at: "2000-01-01T00:00:00Z" },
      { token: "stage1", token_type: "application", application_id: "app-1", expires_at: "2099-01-01T00:00:00Z" },
    ],
    applications: [app()],
    application_screening_payments: [],
  }
})

const line = (over: Row = {}): Row => ({
  org_id: "org-1", application_id: "app-1", subject_id: "app-1", subject_type: "applicant", paid_at: null, ...over,
})

describe("GET /api/applications/invite-status/[token]", () => {
  it("a live invite token returns the tracker fields, unpaid until the ITN stamps the line", async () => {
    expect(await call("tok")).toEqual({
      status: 200,
      body: { reference: "app-1", stage2Status: "pending_payment", feePaid: false, feeCents: 25000 },
    })
  })

  it("paid once fee_paid_at is stamped, or on the older fee_status flag", async () => {
    tables.applications = [app({ fee_paid_at: "2026-10-06T08:00:00Z" })]
    expect((await call("tok")).body.feePaid).toBe(true)
    tables.applications = [app({ fee_status: "paid" })]
    expect((await call("tok")).body.feePaid).toBe(true)
  })

  it("paid when the lead's own line is stamped, even if the applications write never landed", async () => {
    tables.application_screening_payments = [line({ paid_at: "2026-10-06T08:00:00Z" })]
    expect((await call("tok")).body.feePaid).toBe(true)
  })

  it("PLANTED: an unpaid lead line, another party's paid line, or another org's line is not the lead's payment", async () => {
    tables.application_screening_payments = [
      line(),
      line({ subject_id: "co-1", subject_type: "co_applicant", paid_at: "2026-10-06T08:00:00Z" }),
      line({ org_id: "org-2", paid_at: "2026-10-06T08:00:00Z" }),
    ]
    expect((await call("tok")).body.feePaid).toBe(false)
  })

  it("PLANTED: unknown, wrong-type and expired tokens resolve nothing", async () => {
    expect((await call("nope")).status).toBe(404)
    expect((await call("stage1")).status).toBe(404)
    expect((await call("old")).status).toBe(410)
  })

  it("PLANTED: a deleted or purged application reads as not found", async () => {
    tables.applications = [app({ deleted_at: "2026-10-01T00:00:00Z" })]
    expect((await call("tok")).status).toBe(404)
    tables.applications = [app({ pii_purged_at: "2026-10-01T00:00:00Z" })]
    expect((await call("tok")).status).toBe(404)
  })

  it("a read error is a 503, not a not-found", async () => {
    failTable = "application_tokens"
    expect((await call("tok")).status).toBe(503)
    failTable = "applications"
    expect((await call("tok")).status).toBe(503)
    failTable = "application_screening_payments"
    expect((await call("tok")).status).toBe(503)
  })
})
