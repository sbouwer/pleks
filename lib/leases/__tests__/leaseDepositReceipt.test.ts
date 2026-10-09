/**
 * lib/leases/__tests__/leaseDepositReceipt.test.ts — a lease deposit reaches the trust ledger once, and its result is reported truthfully
 *
 * Notes:  Both directions: a deposit with an amount posts through record_deposit_atomic and reports success; no amount
 *         posts nothing; an RPC error is a failed step, never "success".
 */
import { describe, it, expect, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { depositTimerEvent, recordDepositReceived } from "../leaseDepositReceipt"

const lease = { deposit_amount_cents: 2_500_000, tenant_id: "t1", property_id: "p1", unit_id: "u1", start_date: "2026-11-01" }
const dbWith = (error: { message: string } | null) => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error })
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}

describe("recordDepositReceived", () => {
  it("posts the deposit to both ledgers for this org and lease", async () => {
    const { db, rpc } = dbWith(null)
    const step = await recordDepositReceived(db, lease, "l1", "o1", "user1")
    expect(step.status).toBe("success")
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("record_deposit_atomic", expect.objectContaining({
      p_org_id: "o1", p_lease_id: "l1", p_tenant_id: "t1", p_amount_cents: 2_500_000,
      p_dep_txn_type: "deposit_received", p_trust_txn_type: "deposit_received", p_created_by: "user1",
    }))
  })

  it("posts nothing for a lease with no deposit amount", async () => {
    const { db, rpc } = dbWith(null)
    expect((await recordDepositReceived(db, { ...lease, deposit_amount_cents: null }, "l1", "o1", "user1")).status).toBe("skipped")
    expect((await recordDepositReceived(db, { ...lease, deposit_amount_cents: 0 }, "l1", "o1", "user1")).status).toBe("skipped")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("reports a refused posting as failed, with the database's reason", async () => {
    const { db } = dbWith({ message: "trust account closed" })
    expect(await recordDepositReceived(db, lease, "l1", "o1", "user1"))
      .toEqual({ step: "Record deposit", status: "failed", detail: "trust account closed" })
  })
})

describe("depositTimerEvent", () => {
  it("is scoped to the org and lease", () => {
    expect(depositTimerEvent("l1", "o1")).toMatchObject({ org_id: "o1", lease_id: "l1", event_type: "deposit_timer_started" })
  })
})
