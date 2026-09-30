/**
 * lib/actions/__tests__/inspections.scheduledAt.test.ts — the inspection writes store SA wall-clock as an instant
 *
 * Notes:  ADDENDUM_63E B0. Pins the WRITE, not the helper: reverting scheduledInstant to pass the raw
 *         datetime-local string through (the 2h-late bug) must fail here. The db is a capture stub — the
 *         create insert is made to fail so the action stops before seeding rooms or sending comms.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const captured: { insert?: Record<string, unknown>; update?: Record<string, unknown> } = {}

function chain(result: unknown) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = () => b
  b.single = async () => result
  b.maybeSingle = async () => result
  b.insert = (payload: Record<string, unknown>) => { captured.insert = payload; return b }
  b.update = (payload: Record<string, unknown>) => {
    captured.update = payload
    return { eq: async () => ({ error: null }) }
  }
  return b
}

let inspectionRead: unknown = { data: null, error: { message: "stop-after-capture" } }
const db = {
  from: (table: string) => chain(table === "inspections" ? inspectionRead : { data: null, error: null }),
}

vi.mock("@/lib/auth/server", () => ({
  requireAgentWriteAccess: async () => ({ db, userId: "u1", orgId: "o1" }),
}))
vi.mock("@/lib/auth/orgScope", () => ({ isRowInOrg: async () => true }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/messaging/router", () => ({ routeAndSend: vi.fn() }))
vi.mock("@/lib/comms/send-email", () => ({ fetchOrgSettings: vi.fn(), buildBranding: vi.fn() }))
vi.mock("@/lib/inspections/seedRooms", () => ({ seedInspectionRooms: vi.fn() }))
vi.mock("@/lib/inspections/profileHelpers", () => ({ saveProfileFromInspection: vi.fn() }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }))

const { createInspection, rescheduleInspection } = await import("../inspections")

function form(scheduled?: string) {
  const fd = new FormData()
  fd.set("unit_id", "unit1")
  fd.set("property_id", "prop1")
  fd.set("inspection_type", "pre_listing")   // not profile-gated, so the insert is reached directly
  if (scheduled !== undefined) fd.set("scheduled_date", scheduled)
  return fd
}

beforeEach(() => { delete captured.insert; delete captured.update })

describe("createInspection — typed 10:00 is stored as 08:00Z", () => {
  it("converts the datetime-local string at the write", async () => {
    await createInspection(form("2026-10-01T10:00"))
    expect(captured.insert?.scheduled_date).toBe("2026-10-01T08:00:00.000Z")
  })

  it("no date stays null", async () => {
    await createInspection(form())
    expect(captured.insert?.scheduled_date).toBeNull()
  })

  it("an unreal date is rejected before any write", async () => {
    const res = await createInspection(form("2026-02-30T10:00"))
    expect(res).toEqual({ error: "Invalid scheduled date" })
    expect(captured.insert).toBeUndefined()
  })
})

describe("rescheduleInspection — same conversion on the update", () => {
  it("rejects a date-only value rather than storing UTC midnight", async () => {
    const res = await rescheduleInspection("i1", "2026-10-01")
    expect(res).toEqual({ error: "Invalid scheduled date" })
    expect(captured.update).toBeUndefined()
  })

  it("stores a typed 14:00 as 12:00Z", async () => {
    inspectionRead = { data: { org_id: "o1", tenant_id: null, scheduled_date: null, status: "scheduled" }, error: null }
    try {
      await rescheduleInspection("i1", "2026-10-01T14:00")
    } finally {
      inspectionRead = { data: null, error: { message: "stop-after-capture" } }
    }
    expect(captured.update?.scheduled_date).toBe("2026-10-01T12:00:00.000Z")
  })
})
