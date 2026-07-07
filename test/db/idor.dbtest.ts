/**
 * test/db/idor.dbtest.ts — cross-tenant IDOR behavioural guarantee (two-org)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Data:   seeds two independent orgs (A "attacker", B "victim") via seedLedgerCase/seedDepositCase,
 *         then proves the org boundary behaviourally — no mocks, real RPCs + real service-client queries.
 * Notes:  The caller-supplied-ID census (#137–#143) + the pleks/require-org-scope-on-service-write ESLint
 *         rule are a STATIC floor: every service write must carry .eq("org_id", orgId). This suite is the
 *         BEHAVIOURAL proof that the floor actually holds — the gap CD/CC carried the whole census (every
 *         fix was verified source-level, never by a live two-org attempt, because no second org was seeded).
 *
 *         Two classes:
 *           1. RPC write-path guards — the money RPCs take p_org_id; feeding org A's id with org B's
 *              resource must be rejected and mutate nothing (proves the WHERE … AND org_id = p_org_id guard).
 *           2. Service-client scope invariant — the pattern the whole codebase relies on: a read/write keyed
 *              `.eq("id", foreign).eq("org_id", caller)` returns/affects ZERO rows. Table-driven over every
 *              seeded resource: A can never read or mutate B's row by id; B's own scoped access is the control.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedLedgerCase, seedDepositCase, teardownOrg, type SeededCase, type SeededDeposit } from "@/test/db/tier"

const db = svc()

async function balanceOf(invoiceId: string): Promise<number> {
  const { data, error } = await db.from("rent_invoices").select("balance_cents").eq("id", invoiceId).single()
  if (error) throw new Error(`balanceOf: ${error.message}`)
  return data.balance_cents ?? 0
}

async function orgIdOf(table: string, id: string): Promise<string | null> {
  const { data, error } = await db.from(table).select("org_id").eq("id", id).maybeSingle()
  if (error) throw new Error(`orgIdOf ${table}: ${error.message}`)
  return (data?.org_id as string | null) ?? null
}

describe("Cross-tenant IDOR — two-org behavioural guarantee", () => {
  // A = the caller ("attacker") whose org id is supplied to every scoped path.
  // B / Bdep = the victim org whose resource ids the attacker tries to reach.
  let A: SeededCase
  let B: SeededCase
  let Bdep: SeededDeposit
  const orgs: string[] = []

  beforeAll(async () => {
    A = await seedLedgerCase(db, { invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }] })
    B = await seedLedgerCase(db, { invoices: [{ key: "X", totalCents: 100_000, dueOffsetDays: 0 }] })
    Bdep = await seedDepositCase(db, { refundCents: 50_000, deductionsCents: 10_000 })
    orgs.push(A.orgId, B.orgId, Bdep.orgId)
  })

  afterAll(() => {
    for (const orgId of orgs.splice(0)) teardownOrg(orgId)
  })

  // ── 1. RPC write-path org guards ───────────────────────────────────────────────

  it("record_payment_atomic: org A cannot pay org B's invoice", async () => {
    const balanceBefore = await balanceOf(B.invoices.X.id)

    const { error } = await db.rpc("record_payment_atomic", {
      p_org_id: A.orgId,               // attacker's org
      p_invoice_id: B.invoices.X.id,   // victim's invoice
      p_amount_cents: 50_000,
      p_payment_date: "2026-07-05",
      p_method: "eft",
      p_reference: "IDOR-PROBE",
      p_recorded_by: null,
      p_receipt_number: `IDOR-${B.invoices.X.id.slice(0, 8)}`,
      p_notes: null,
    })

    // The org guard must reject the mismatch — but the load-bearing assertions are the mutation checks
    // (robust whether the RPC RAISEs or silently finds no in-org invoice): B's invoice is untouched…
    expect(error, "cross-org payment should be rejected by the RPC's org guard").toBeTruthy()
    expect(await balanceOf(B.invoices.X.id), "B's invoice balance must be unchanged").toBe(balanceBefore)

    // …and no payment referencing B's invoice exists under either org.
    const { data: pays, error: paysErr } = await db.from("payments").select("id").eq("invoice_id", B.invoices.X.id)
    expect(paysErr, "payments probe query should not error").toBeFalsy()
    expect(pays ?? [], "no payment may be created against B's invoice").toHaveLength(0)
  })

  it("disburse_deposit_atomic: org A cannot disburse org B's deposit", async () => {
    const { data: reconBefore, error: reconBeforeErr } = await db.from("deposit_reconciliations").select("status").eq("id", Bdep.reconId).single()
    expect(reconBeforeErr, "recon read should not error").toBeFalsy()

    const { error } = await db.rpc("disburse_deposit_atomic", {
      p_org_id: A.orgId,        // attacker's org
      p_lease_id: Bdep.leaseId, // victim's lease
      p_actor: null,
      p_reference: "IDOR-PROBE",
      p_tenant_name: "Attacker",
    })

    expect(error, "cross-org disbursement should be rejected by the RPC's org guard").toBeTruthy()

    // No deposit/trust postings may have been created against B's lease, and the recon stays as-was.
    const { count: depositTxns } = await db
      .from("deposit_transactions").select("id", { count: "exact", head: true }).eq("lease_id", Bdep.leaseId)
    const { count: trustTxns } = await db
      .from("trust_transactions").select("id", { count: "exact", head: true }).eq("lease_id", Bdep.leaseId)
    const { data: reconAfter, error: reconAfterErr } = await db.from("deposit_reconciliations").select("status").eq("id", Bdep.reconId).single()
    expect(reconAfterErr, "recon read should not error").toBeFalsy()

    expect(depositTxns ?? 0, "no deposit_transactions against B's lease").toBe(0)
    expect(trustTxns ?? 0, "no trust_transactions against B's lease").toBe(0)
    expect(reconAfter?.status, "B's reconciliation status must be unchanged").toBe(reconBefore?.status ?? null)
  })

  // ── 2. Service-client org-scope invariant (table-driven over every seeded resource) ──

  const RESOURCES: Array<{ table: string; idOf: (c: SeededCase) => string }> = [
    { table: "properties",    idOf: (c) => c.propertyId },
    { table: "units",         idOf: (c) => c.unitId },
    { table: "contacts",      idOf: (c) => c.contactId },
    { table: "tenants",       idOf: (c) => c.tenantId },
    { table: "leases",        idOf: (c) => c.leaseId },
    { table: "rent_invoices", idOf: (c) => c.invoices.X.id },
  ]

  describe.each(RESOURCES)("$table — org boundary", ({ table, idOf }) => {
    it("READ: A's org-scoped query cannot see B's row by id (but B's own can)", async () => {
      const idB = idOf(B)

      // The row genuinely belongs to B (org_id integrity — guards against a seed/back-fill mistake).
      expect(await orgIdOf(table, idB), `${table} row must belong to org B`).toBe(B.orgId)

      // The pattern the whole codebase uses: filter by caller's org. A must get nothing.
      const { data: leaked, error: leakErr } = await db.from(table).select("id, org_id").eq("id", idB).eq("org_id", A.orgId).maybeSingle()
      expect(leakErr, "scoped read probe should not error").toBeFalsy()
      expect(leaked, `org A must NOT read org B's ${table} row by id`).toBeNull()

      // Control: correctly-scoped read (B's own org) returns the row — proves the query itself works.
      const { data: own, error: ownErr } = await db.from(table).select("id").eq("id", idB).eq("org_id", B.orgId).maybeSingle()
      expect(ownErr, "control read should not error").toBeFalsy()
      expect(own?.id, `org B's own scoped read must return the ${table} row`).toBe(idB)
    })

    it("WRITE: A's org-scoped update cannot mutate B's row (0 rows affected)", async () => {
      const idB = idOf(B)

      // The scoped-write shape the ESLint rule enforces: .eq("id", foreign).eq("org_id", caller).
      // Against a foreign row this matches 0 rows, so the SET (org_id → A, itself a no-op here) never applies.
      const { data: updated, error } = await db
        .from(table).update({ org_id: A.orgId }).eq("id", idB).eq("org_id", A.orgId).select("id")

      expect(error, "the scoped update query itself should not error").toBeFalsy()
      expect(updated ?? [], `org A's scoped update must affect 0 rows of B's ${table}`).toHaveLength(0)

      // Belt: B's row still belongs to B — no cross-org takeover happened.
      expect(await orgIdOf(table, idB), `B's ${table} row must still belong to org B`).toBe(B.orgId)
    })
  })
})
