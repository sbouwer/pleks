import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(() => Promise.resolve()) }))

import { isOnHold, placeLegalHold, liftLegalHold, type LegalHoldEvent } from "../holds"
import { recordAudit } from "@/lib/audit/recordAudit"

type Db = Parameters<typeof isOnHold>[0]

function holdRow(over: Partial<LegalHoldEvent>): LegalHoldEvent {
  return {
    id: "h", org_id: "org", scope_type: "application", scope_id: "app-1",
    event_type: "hold_placed", trigger_category: "tribunal_matter",
    placed_by: null, placed_by_capacity: "system", reason_text: null,
    external_reference: null, lift_event_id: null,
    instrument_hash: "x", prev_instrument_hash: "0", created_at: "2026-06-01T00:00:00Z",
    ...over,
  }
}

/** select-only db: every builder method returns the same plain object; awaiting it yields { data, error }. */
function selectDb(rows: LegalHoldEvent[]): Db {
  const chain: Record<string, unknown> = { data: rows, error: null }
  for (const m of ["select", "eq", "order"]) chain[m] = () => chain
  return { from: () => chain } as unknown as Db
}

describe("isOnHold — active-hold resolution (SPEC §10.1–4)", () => {
  it("returns the hold when one hold_placed exists", async () => {
    const h = holdRow({ id: "h1" })
    expect(await isOnHold(selectDb([h]), { scopeType: "application", scopeId: "app-1" })).toEqual(h)
  })

  it("returns null when the hold_placed is lifted", async () => {
    const rows = [
      holdRow({ id: "lift1", event_type: "hold_lifted", lift_event_id: "h1", created_at: "2026-06-02T00:00:00Z" }),
      holdRow({ id: "h1" }),
    ]
    expect(await isOnHold(selectDb(rows), { scopeType: "application", scopeId: "app-1" })).toBeNull()
  })

  it("returns the new hold after a prior one was lifted", async () => {
    const rows = [
      holdRow({ id: "h2", created_at: "2026-06-03T00:00:00Z" }),
      holdRow({ id: "lift1", event_type: "hold_lifted", lift_event_id: "h1", created_at: "2026-06-02T00:00:00Z" }),
      holdRow({ id: "h1" }),
    ]
    expect((await isOnHold(selectDb(rows), { scopeType: "application", scopeId: "app-1" }))?.id).toBe("h2")
  })

  it("returns the unlifted hold when two are placed and one is lifted", async () => {
    const rows = [
      holdRow({ id: "h2", created_at: "2026-06-03T00:00:00Z" }),
      holdRow({ id: "lift1", event_type: "hold_lifted", lift_event_id: "h1", created_at: "2026-06-02T00:00:00Z" }),
      holdRow({ id: "h1" }),
    ]
    expect((await isOnHold(selectDb(rows), { scopeType: "application", scopeId: "app-1" }))?.id).toBe("h2")
  })

  it("fails closed (throws) on a query error — never reads a DB failure as 'no hold'", async () => {
    const errDb = { from: () => { const c: Record<string, unknown> = { data: null, error: { message: "boom" } }; for (const m of ["select", "eq", "order"]) { c[m] = () => c } return c } } as unknown as Db
    await expect(isOnHold(errDb, { scopeType: "application", scopeId: "app-1" })).rejects.toThrow(/boom/)
  })
})

/** write db: read returns `original`; after .insert() the .single() returns the inserted row with an id. */
function writeDb(original: LegalHoldEvent | null): Db {
  const chain: Record<string, unknown> = {}
  let inserted: Record<string, unknown> | null = null
  chain.select = () => chain
  chain.eq = () => chain
  chain.insert = (vals: Record<string, unknown>) => { inserted = vals; return chain }
  chain.single = () => Promise.resolve(
    inserted ? { data: { id: "new-id", ...inserted }, error: null } : { data: original, error: null },
  )
  return { from: () => chain } as unknown as Db
}

describe("placeLegalHold / liftLegalHold — audit shape (SPEC §10.13–14)", () => {
  it("place writes an INSERT audit with legal_hold_placed and EXCLUDES reason_text (RULE #7)", async () => {
    vi.mocked(recordAudit).mockClear()
    await placeLegalHold(writeDb(null), {
      orgId: "org", scopeType: "application", scopeId: "app-1",
      triggerCategory: "tribunal_matter", placedBy: "u1", placedByCapacity: "pleks_io",
      reasonText: "sensitive PII reason", externalReference: "REF-123",
    })
    expect(recordAudit).toHaveBeenCalledTimes(1)
    const [, input] = vi.mocked(recordAudit).mock.calls[0]
    expect(input.action).toBe("INSERT")
    expect(input.table).toBe("legal_hold_events")
    expect((input.after as Record<string, unknown>).action).toBe("legal_hold_placed")
    expect((input.after as Record<string, unknown>).external_reference).toBe("REF-123")
    expect(input.after as Record<string, unknown>).not.toHaveProperty("reason_text")
  })

  it("lift writes an INSERT audit with legal_hold_lifted + the original_hold_id, and sets lift_event_id", async () => {
    vi.mocked(recordAudit).mockClear()
    const original = holdRow({ id: "h1", org_id: "org", scope_type: "subject", scope_id: "sub-1" })
    const lifted = await liftLegalHold(writeDb(original), {
      holdEventId: "h1", liftedBy: "u2", liftedByCapacity: "agency_io",
    })
    expect(lifted.lift_event_id).toBe("h1")
    expect(lifted.event_type).toBe("hold_lifted")
    const [, input] = vi.mocked(recordAudit).mock.calls[0]
    expect((input.after as Record<string, unknown>).action).toBe("legal_hold_lifted")
    expect((input.after as Record<string, unknown>).original_hold_id).toBe("h1")
  })
})
