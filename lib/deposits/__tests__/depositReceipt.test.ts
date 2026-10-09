/**
 * lib/deposits/__tests__/depositReceipt.test.ts — a deposit counts as received on EITHER ledger; an unread ledger is never "not received"
 *
 * Notes:  The GL import writes trust_transactions only, so a reader of deposit_transactions alone offered to post a
 *         received deposit twice. Both directions per ledger, plus the fail-closed read and the interest start rule.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { depositReceipt, interestStartDate } from "../depositReceipt"

type Result = { data: { created_at: string }[] | null; error: { message: string } | null }
function dbWith(byTable: Record<string, Result>) {
  const chain = (table: string) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve(byTable[table]) }
    return q
  }
  return { from: (t: string) => chain(t) } as unknown as SupabaseClient
}
const none: Result = { data: [], error: null }
const at = (d: string): Result => ({ data: [{ created_at: d }], error: null })

describe("depositReceipt", () => {
  it("is not received when neither ledger holds a deposit_received", async () => {
    expect(await depositReceipt(dbWith({ deposit_transactions: none, trust_transactions: none }), "l1", "o1"))
      .toEqual({ ok: true, receivedAt: null })
  })

  it("counts a trust-only deposit (the GL import's shape) as received", async () => {
    expect(await depositReceipt(dbWith({ deposit_transactions: none, trust_transactions: at("2026-03-01T10:00:00Z") }), "l1", "o1"))
      .toEqual({ ok: true, receivedAt: "2026-03-01T10:00:00Z" })
  })

  it("takes the earlier of the two ledgers", async () => {
    const db = dbWith({ deposit_transactions: at("2026-05-01T00:00:00Z"), trust_transactions: at("2026-04-01T00:00:00Z") })
    expect(await depositReceipt(db, "l1", "o1")).toEqual({ ok: true, receivedAt: "2026-04-01T00:00:00Z" })
  })

  it("fails closed when either ledger cannot be read", async () => {
    const db = dbWith({ deposit_transactions: none, trust_transactions: { data: null, error: { message: "boom" } } })
    expect(await depositReceipt(db, "l1", "o1")).toEqual({ ok: false, error: "boom" })
  })
})

describe("interestStartDate", () => {
  it("runs from the receipt when the deposit arrived after the lease started", () => {
    expect(interestStartDate({ start_date: "2026-01-01", migrated: false }, "2026-02-15T09:00:00Z")).toBe("2026-02-15")
  })
  it("runs from the lease start when the deposit arrived before it", () => {
    expect(interestStartDate({ start_date: "2026-01-01", migrated: false }, "2025-12-20T09:00:00Z")).toBe("2026-01-01")
  })
  it("keeps the lease start for a migrated lease, whose receipt is dated the import day", () => {
    expect(interestStartDate({ start_date: "2024-01-01", migrated: true }, "2026-10-09T09:00:00Z")).toBe("2024-01-01")
  })
})
