/**
 * test/db/gl-import.dbtest.ts — the TRUST-LEDGER import: the one path with real money behind it
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Every other import path writes a lease. This one writes the TRUST LEDGER — money the agency holds on
 *         behalf of other people — and until now it was the only path with no database test at all: a pure
 *         parser unit test, and nothing that ever watched a cent land.
 *
 *         The invariants here do not exist anywhere else:
 *
 *           BALANCE          a GL whose debits do not equal its credits is not a book. Importing it produces a
 *                            lopsided ledger that will never reconcile, and the agency will not find out until
 *                            their trust account fails an audit.
 *           MATCH-NOT-GUESS  a transaction whose lease reference matches nothing must be FLAGGED, never
 *                            attached to the nearest plausible lease. Money credited to the wrong tenant is
 *                            worse than money not credited at all.
 *           IDEMPOTENCE      an agency WILL re-run a GL import. If the second run doubles the opening balances,
 *                            every deposit in the book is now twice what the agency actually holds.
 *           NO INVENTED RATE an opening balance landing on a lease with no resolvable interest rate must HOLD
 *                            accrual, not invent one. That is the `?? 5` fix from the deposit work meeting this
 *                            path for the first time.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedLedgerCase, seedUser, teardownOrg, teardownUser, type SeededCase } from "@/test/db/tier"
import { runGLImport } from "@/lib/import/glImportRunner"
import type { GLPropertyBlock, GLTransaction, GLDepositTransaction } from "@/lib/import/parseGLReport"

const db = svc()

const DAY = 24 * 60 * 60 * 1000
const asOf = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY)

function payment(amountCents: number, daysAgo: number, unitRef: string | null = null): GLTransaction {
  return {
    date: asOf(daysAgo), type: "payment", amountCents,
    description: `Rent received ${amountCents}`, unitRef, period: null,
    rawDescription: `PAYMENT ${amountCents}`,
  }
}

function depositReceived(amountCents: number, daysAgo: number): GLDepositTransaction {
  return {
    date: asOf(daysAgo), type: "deposit_received",
    debitCents: 0, creditCents: amountCents,
    rawDescription: `DEPOSIT RECEIVED ${amountCents}`,
  }
}

function block(overrides: Partial<GLPropertyBlock> = {}): GLPropertyBlock {
  return {
    propertyName: "Test Property", ownerName: "Owner",
    periodFrom: asOf(60), periodTo: asOf(0),
    arTransactions: [], depositTransactions: [],
    closingBalance: 0, unitRefs: [],
    ...overrides,
  }
}

/** The runner's own key shape — `${propertyName}(${ownerName})`. Hard-coding a guess here would test nothing. */
const PROPERTY_KEY = "Test Property(Owner)"

async function trustRows(orgId: string) {
  const { data, error } = await db
    .from("trust_transactions")
    .select("id, amount_cents, direction, transaction_type, is_opening_balance, created_at")
    .eq("org_id", orgId)
  if (error) throw new Error(`trust read-back: ${error.message}`)
  return data ?? []
}

describe("GL IMPORT — the trust ledger", () => {
  let agentId: string
  const orgs: string[] = []

  const seed = async (): Promise<SeededCase> => {
    const c = await seedLedgerCase(db, { invoices: [] })
    orgs.push(c.orgId)
    return c
  }

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  const options = (orgId: string) => ({
    orgId, agentId, importDeposits: true,
    dateFilter: { from: asOf(365).toISOString().slice(0, 10), to: asOf(-1).toISOString().slice(0, 10) },
  })

  // ── MATCH, NEVER GUESS ────────────────────────────────────────────────────────────────────────

  it("a transaction whose lease reference matches NOTHING is flagged — never attached to a nearby lease", async () => {
    // Money credited to the wrong tenant is worse than money not credited at all: it is a false receipt, and
    // the tenant who really paid is still in arrears.
    const c = await seed()

    const result = await runGLImport(
      [block({ arTransactions: [payment(500_00, 10, "UNIT-DOES-NOT-EXIST")] })],
      {},               // no lease matches at all
      {},               // no property matches either
      options(c.orgId), db,
    )

    expect(result.transactionsCreated, "nothing may be posted against a lease we could not identify").toBe(0)
    expect(result.errors.length, "and the agency must be TOLD which transaction we could not place").toBeGreaterThan(0)
    expect(result.errors[0].message).toMatch(/no lease match/i)
    expect((await trustRows(c.orgId)).length, "the trust ledger must be untouched").toBe(0)
  }, 120_000)

  // ── IDEMPOTENCE ───────────────────────────────────────────────────────────────────────────────

  it("re-running the same GL import does not double the trust ledger", async () => {
    const c = await seed()
    const blocks = [block({
      arTransactions: [payment(500_00, 10), payment(750_00, 20)],
      depositTransactions: [depositReceived(1_000_00, 30)],
    })]
    const propertyMatches = { [PROPERTY_KEY]: c.leaseId }

    const first = await runGLImport(blocks, {}, propertyMatches, options(c.orgId), db)
    const afterFirst = await trustRows(c.orgId)
    expect(afterFirst.length, "the first run posts the book").toBe(
      first.transactionsCreated + first.depositsCreated,
    )
    expect(afterFirst.length).toBeGreaterThan(0)

    const second = await runGLImport(blocks, {}, propertyMatches, options(c.orgId), db)
    const afterSecond = await trustRows(c.orgId)

    expect(
      afterSecond.length,
      "an agency WILL re-run an import — after a mapping fix, after a crash, or simply out of uncertainty. " +
      "A second run that doubles the opening balances means every deposit in the book is now twice what the " +
      "agency actually holds, and the trust account no longer reconciles.",
    ).toBe(afterFirst.length)
    expect(second.skipped, "the re-run must SAY it skipped them, not silently do nothing").toBeGreaterThan(0)
  }, 180_000)

  it("re-running a GL import WEEKS later still does not double it", async () => {
    // The dedup window is the whole question. `isDuplicate` matches on `created_at` — WHEN WE IMPORTED — within
    // ±3 days, because `recordTrustTransaction` never persists the GL transaction's own date. So the guard is
    // not "have I already imported this transaction?", it is "did I import something like it THIS WEEK?".
    //
    // An agency that re-runs the import a fortnight later — after fixing a lease mapping, say — falls outside
    // the window, and every opening balance in the book posts a second time.
    const c = await seed()
    const blocks = [block({
      arTransactions: [payment(500_00, 10)],
      depositTransactions: [depositReceived(1_000_00, 30)],
    })]
    const propertyMatches = { [PROPERTY_KEY]: c.leaseId }

    await runGLImport(blocks, {}, propertyMatches, options(c.orgId), db)
    const afterFirst = await trustRows(c.orgId)
    expect(afterFirst.length).toBeGreaterThan(0)

    // Age the ledger: the rows were imported a fortnight ago. Nothing else about them changes.
    const { error } = await db
      .from("trust_transactions")
      .update({ created_at: new Date(Date.now() - 14 * DAY).toISOString() })
      .eq("org_id", c.orgId)
    expect(error, "ageing the ledger").toBeFalsy()

    await runGLImport(blocks, {}, propertyMatches, options(c.orgId), db)
    const afterSecond = await trustRows(c.orgId)

    expect(
      afterSecond.length,
      "the SAME book, re-imported a fortnight later, must not post a single cent twice. Deduplicating on when " +
      "we imported rather than on what the transaction IS makes idempotence a function of the calendar.",
    ).toBe(afterFirst.length)
  }, 180_000)

  // ── NO INVENTED RATE ──────────────────────────────────────────────────────────────────────────

  it("a GL deposit opening balance does NOT invent an interest rate", async () => {
    // The `?? 5` fix meeting this path for the first time. A deposit carried in as an opening balance states
    // what the agency HOLDS. It never states that interest has been EARNED on it — and if no rate is
    // resolvable for that lease, the correct behaviour is to hold accrual, not to guess a rate on other
    // people's trust money.
    const c = await seed()

    await runGLImport(
      [block({ depositTransactions: [depositReceived(1_000_00, 30)] })],
      {}, { [PROPERTY_KEY]: c.leaseId }, options(c.orgId), db,
    )

    const { data: accruals, error } = await db
      .from("deposit_transactions")
      .select("id, amount_cents")
      .eq("org_id", c.orgId)
      .eq("transaction_type", "interest_accrued")
    expect(error).toBeFalsy()

    expect(
      (accruals ?? []).length,
      "an opening balance says what is HELD, never what has been EARNED. An accrual here means a rate was " +
      "invented on money the agency holds for someone else.",
    ).toBe(0)
  }, 120_000)

  // ── OPENING BALANCES ARE MARKED AS SUCH ───────────────────────────────────────────────────────

  it("every GL row lands as an OPENING BALANCE, not as a live movement", async () => {
    // An imported historical payment is not money that moved through the agency's bank today. If it is not
    // marked as an opening balance, it lands in the current reconciliation period and the bank statement will
    // never match it.
    const c = await seed()

    await runGLImport(
      [block({
        arTransactions: [payment(500_00, 10)],
        depositTransactions: [depositReceived(1_000_00, 30)],
      })],
      {}, { [PROPERTY_KEY]: c.leaseId }, options(c.orgId), db,
    )

    const rows = await trustRows(c.orgId)
    expect(rows.length).toBeGreaterThan(0)
    expect(
      rows.filter((r) => !r.is_opening_balance).map((r) => r.transaction_type),
      "a historical GL row that is not flagged as an opening balance will be hunted for on this month's bank " +
      "statement, and never found",
    ).toEqual([])
  }, 120_000)

  // ── INCOHERENT ROWS ───────────────────────────────────────────────────────────────────────────

  it("a row that is BOTH a credit and a debit is refused — not silently resolved in favour of one", async () => {
    // `mapDepositAmount` took the credit if there was one and otherwise the debit, so a row carrying both
    // posted the credit and DISCARDED the debit. R500 gone, nothing said. A single ledger line cannot be both;
    // if the agency's export says it is, one of the two figures is wrong and only they know which.
    const c = await seed()

    const result = await runGLImport(
      [block({
        depositTransactions: [{
          date: asOf(20), type: "deposit_received",
          creditCents: 1_000_00, debitCents: 500_00,
          rawDescription: "BOTH SIDES",
        }],
      })],
      {}, { [PROPERTY_KEY]: c.leaseId }, options(c.orgId), db,
    )

    expect(result.depositsCreated, "an incoherent row must not reach the trust ledger").toBe(0)
    expect(result.errors.map((e) => e.message).join(" ")).toMatch(/both/i)
    expect((await trustRows(c.orgId)).length, "and not a cent of it may land").toBe(0)
  }, 120_000)

  it("a row that moves NO money is refused — a zero trust transaction is not a transaction", async () => {
    const c = await seed()

    const result = await runGLImport(
      [block({
        depositTransactions: [{
          date: asOf(20), type: "deposit_received",
          creditCents: 0, debitCents: 0,
          rawDescription: "EMPTY ROW",
        }],
      })],
      {}, { [PROPERTY_KEY]: c.leaseId }, options(c.orgId), db,
    )

    expect(result.depositsCreated).toBe(0)
    expect((await trustRows(c.orgId)).length, "a zero-amount row would sit in the reconciliation forever").toBe(0)
  }, 120_000)

  // ── MONEY CONSERVATION ────────────────────────────────────────────────────────────────────────

  it("every cent in the GL lands in the trust ledger, to the cent — and no cent more", async () => {
    // The money-conservation invariant, on the path where the money is not ours. Any x100, any dropped side,
    // any doubled row shows up here immediately and does not need anyone to guess which field it hid in.
    const c = await seed()

    const payments = [payment(500_00, 10), payment(750_50, 20), payment(1_234_56, 25)]
    const deposits = [depositReceived(1_000_00, 30), depositReceived(2_500_00, 40)]

    await runGLImport(
      [block({ arTransactions: payments, depositTransactions: deposits })],
      {}, { [PROPERTY_KEY]: c.leaseId }, options(c.orgId), db,
    )

    const rows = await trustRows(c.orgId)
    const expected = [...payments.map((p) => p.amountCents), ...deposits.map((d) => d.creditCents)]
      .reduce((a, b) => a + b, 0)
    const actual = rows.reduce((sum, r) => sum + Math.abs(r.amount_cents as number), 0)

    expect(
      actual,
      `the GL carries ${expected} cents; the trust ledger holds ${actual}. This is other people's money — ` +
      "the two numbers are the same number or the agency's trust account does not reconcile.",
    ).toBe(expected)
  }, 180_000)

  // ── DENSITY, on the money path ────────────────────────────────────────────────────────────────

  it("a GL half full of unmatched references imports the matched half and names the rest", async () => {
    // Strictness costs the ROW, never the BOOK — the same doctrine as the wizard path, but here the rows are
    // money. Ten transactions, five against a lease we know and five against one we do not.
    const c = await seed()

    const matched = [payment(100_00, 5), payment(200_00, 6), payment(300_00, 7)]
    const orphans = [
      payment(400_00, 8, "GHOST-1"), payment(500_00, 9, "GHOST-2"),
    ]

    // The orphans carry a unit ref that resolves to nothing AND sit in a property block we cannot match.
    const result = await runGLImport(
      [
        block({ arTransactions: matched }),
        block({ propertyName: "Unknown Property", arTransactions: orphans }),
      ],
      {}, { [PROPERTY_KEY]: c.leaseId }, options(c.orgId), db,
    )

    expect(result.transactionsCreated, "the matched half lands").toBe(matched.length)
    expect(result.errors.length, "and every orphan is named").toBe(orphans.length)
    expect(result.skipped, "…and counted").toBeGreaterThanOrEqual(orphans.length)

    const rows = await trustRows(c.orgId)
    expect(rows.length, "no orphan may have been attached to the lease we DID know").toBe(matched.length)
  }, 180_000)
})
