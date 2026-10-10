/**
 * lib/actions/__tests__/maintenance.orgScope.test.ts — maintenance actions refuse another org's ids
 *
 * Notes:  Must-fail fixtures for the cross-org reads closed in fix/service-read-defects. isRowInOrg is stubbed to
 *         deny one table at a time; the action must refuse before it reads, writes or audits anything. Removing a
 *         guard (or dropping a table from formIdsInOrg's list) fails here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

let foreignTable: string | null = null
const touched: string[] = []
const audits: unknown[] = []

function chain(table: string) {
  touched.push(table)
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "order", "limit", "insert", "update", "not", "is"]) b[m] = () => b
  b.single = async () => ({ data: null, error: { message: "stub" } })
  b.maybeSingle = async () => ({ data: null, error: null })
  return b
}
const db = { from: (t: string) => chain(t) }

vi.mock("@/lib/auth/server", () => ({
  requireAgentWriteAccess: async () => ({ db, userId: "u1", orgId: "o1" }),
}))
vi.mock("@/lib/supabase/gateway", () => ({ gateway: async () => ({ db, userId: "u1", orgId: "o1" }) }))
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => db }))
vi.mock("@/lib/auth/orgScope", () => ({
  isRowInOrg: async (_db: unknown, table: string, id: string | null) => !!id && table !== foreignTable,
}))
vi.mock("@/lib/audit/recordAudit", () => ({
  recordAudit: vi.fn(async (_db: unknown, a: unknown) => { audits.push(a) }),
  recordAuditReturningId: vi.fn(async (_db: unknown, a: unknown) => { audits.push(a); return "audit1" }),
  recordAuditMany: vi.fn(),
}))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/messaging/router", () => ({ routeAndSend: vi.fn() }))
vi.mock("@/lib/comms/send-email", () => ({ sendEmail: vi.fn(), fetchOrgSettings: vi.fn(), buildBranding: vi.fn() }))

const { createMaintenanceRequest, addMaintenanceNote } = await import("../maintenance")

function form() {
  const fd = new FormData()
  for (const [k, v] of Object.entries({
    title: "Leak", description: "Kitchen tap", unit_id: "unit1", property_id: "prop1", building_id: "bld1",
    tenant_id: "ten1", lease_id: "lease1", contractor_id: "con1",
  })) fd.set(k, v)
  return fd
}

beforeEach(() => { foreignTable = null; touched.length = 0; audits.length = 0 })

describe("createMaintenanceRequest — every form id must be the caller org's", () => {
  it.each(["units", "properties", "buildings", "tenants", "leases", "contractors"])(
    "refuses a foreign %s id before reading or writing anything",
    async (table) => {
      foreignTable = table
      const res = await createMaintenanceRequest(form())
      expect(res).toEqual({ error: "Unit not found" })
      expect(touched).toEqual([])
    },
  )
})

describe("addMaintenanceNote — the request must be the caller org's", () => {
  it("refuses a foreign request without writing the note's audit row", async () => {
    foreignTable = "maintenance_requests"
    const res = await addMaintenanceNote("req1", "note", true)
    expect(res).toEqual({ error: "Request not found" })
    expect(audits).toEqual([])
    expect(touched).toEqual([])
  })
})
