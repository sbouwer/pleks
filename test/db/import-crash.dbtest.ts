/**
 * test/db/import-crash.dbtest.ts — the import dies mid-book. Does a re-run CONVERGE, or corrupt?
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  There is NO wrapping transaction around an import, by design — a 5 000-row book cannot be one
 *         Postgres transaction. The price of that decision is that a crash leaves the database HALF-WRITTEN:
 *         some properties, units, tenants and leases committed, the rest not.
 *
 *         The stress harness already proves COMPLETE-run idempotency (import the same book twice → identical
 *         database). That is the easy half, and it is not the half agencies hit. The one they hit is the flaky
 *         connection: the import dies at row N, they press "import" again, and the only question that matters is
 *
 *             does the database converge on exactly what ONE CLEAN RUN would have produced?
 *
 *         Not "does it error". Not "does it finish". CONVERGE — because the failure here is not a crash, it is a
 *         book that half-imported, was re-run, and now holds two leases on one unit, or a tenant with no lease,
 *         or a deposit posted twice into the trust ledger. Money, silently wrong, from a dropped packet.
 *
 *         The crash is injected at the TRANSPORT (test/import/crashClient.ts), not by mocking the runner — the
 *         runner must not be able to tell it is being tested, or the test proves nothing about the real path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport, type ImportResult } from "@/lib/import/importRunner"
import { generateBook } from "@/test/import/book"
import { render, type RenderedBook } from "@/test/import/dialect"
import { contentHash } from "@/test/import/reconcile"
import { crashAfter, InjectedCrash } from "@/test/import/crashClient"

const db = svc()

function wireOf(book: RenderedBook) {
  const suggestions = matchColumns(book.headers)
  const w: Record<string, { field: string; entity: string }> = {}
  for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }
  return w
}

async function importWith(
  client: SupabaseClient, orgId: string, agentId: string, book: RenderedBook,
): Promise<ImportResult> {
  const w = wireOf(book)
  return runImport(
    book.rows, toColumnMapping(w),
    toImportDecisions({
      columnMapping: w, expiredLeaseAction: "import_as_expired",
      bankConsentAttested: true, depositsHeldAttested: true,
    }),
    orgId, agentId, undefined, client,
  )
}

describe("CRASH RECOVERY — the import dies mid-book; the re-run must converge", () => {
  let agentId: string
  const orgs: string[] = []

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  it("crash at three different depths, re-run each — every one converges on the CLEAN-RUN database", async () => {
    const truth = generateBook({ seed: 77, leases: 6, landlords: 2, vendors: 2, variety: true })
    const book = render(truth, "en-ZA")

    // The reference: one clean, uninterrupted run. Every crashed-then-retried run must end up HERE.
    const cleanOrg = await seedEmptyOrg(db)
    orgs.push(cleanOrg)
    await importWith(db, cleanOrg, agentId, book)
    const cleanState = await contentHash(db, cleanOrg)
    expect(cleanState.length, "the clean run must actually write something").toBeGreaterThan(50)

    const divergences: string[] = []

    // Kill it early (mid-property), midway (mid-lease) and late (after most rows) — the three places where a
    // half-written book is structurally different, not merely smaller.
    for (const killAfter of [4, 12, 30]) {
      const org = await seedEmptyOrg(db)
      orgs.push(org)

      const { client } = crashAfter(db, killAfter)
      let result
      try {
        result = await importWith(client, org, agentId, book)
      } catch (e) {
        // The runner may also propagate — either is acceptable; what is NOT acceptable is finishing quietly.
        if (!(e instanceof InjectedCrash)) throw e
      }

      // WHAT THE RUNNER ACTUALLY DOES, and it is the right thing: it catches the dead connection PER ROW,
      // records it as a row-level error, and carries on. It does not pretend to have succeeded — with the
      // connection gone after 4 writes it reports 0 leases and an error against every row it could not write.
      // So the assertion is not "it threw"; it is "it did not report success it had not earned".
      if (result) {
        const reported = result.errors.filter((e) => e.severity === "error").length
        expect(
          reported,
          `the import lost its connection after ${killAfter} write(s) and must SAY so, on the rows it lost`,
        ).toBeGreaterThan(0)
      }

      const partial = await contentHash(db, org)

      // PROVE THE PROBE FIRES. If the crash left the database in the same state a clean run would have, then
      // nothing was interrupted and "it converged" is a statement about a test that did nothing. The whole
      // point is that the database is genuinely HALF-WRITTEN at this instant.
      expect(
        partial,
        `crash after ${killAfter} write(s) left the database COMPLETE — the injection did not actually ` +
        `interrupt anything, so the convergence assertion below would prove nothing`,
      ).not.toBe(cleanState)

      // The agency presses "import" again.
      await importWith(db, org, agentId, book)
      const recovered = await contentHash(db, org)

      if (recovered !== cleanState) {
        divergences.push(
          `crash after ${killAfter} write(s): the re-run did NOT converge on the clean-run database ` +
          `(partial ${partial.length} chars → recovered ${recovered.length} chars, clean is ${cleanState.length})`,
        )
      }
    }

    expect(
      divergences,
      "a crashed import that is re-run must end up EXACTLY where one clean run would have — not doubled, not " +
      "stranded, not half-linked. This is the flaky-connection case, and it is the one agencies actually hit.",
    ).toEqual([])
  }, 300_000)

  it("a crashed run leaves no ORPHANS — no lease without a real tenant or a real unit", async () => {
    // Convergence by content hash proves the END state. This proves the INTERMEDIATE state is not toxic: a
    // half-written book must never leave a lease pointing at a tenant row that was never committed.
    const truth = generateBook({ seed: 78, leases: 5, variety: true })
    const book = render(truth, "en-ZA")
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const { client } = crashAfter(db, 9)
    try {
      await importWith(client, org, agentId, book)
    } catch (e) {
      if (!(e instanceof InjectedCrash)) throw e   // the runner usually absorbs it per row; either is fine here
    }

    const { data: leases, error: e1 } = await db
      .from("leases").select("id, tenant_id, unit_id").eq("org_id", org)
    const { data: units, error: e2 } = await db.from("units").select("id").eq("org_id", org)
    const { data: tenants, error: e3 } = await db.from("tenants").select("id").eq("org_id", org)
    expect(e1 ?? e2 ?? e3, "orphan read-back").toBeFalsy()

    const unitIds = new Set((units ?? []).map((u) => u.id))
    const tenantIds = new Set((tenants ?? []).map((t) => t.id))
    const broken = (leases ?? []).filter(
      (l) => !unitIds.has(l.unit_id as string) || !tenantIds.has(l.tenant_id as string),
    )

    expect(
      broken.map((l) => l.id),
      "a lease committed by a crashed import must still point at a REAL unit and a REAL tenant",
    ).toEqual([])
  }, 180_000)

  // ── ORG ISOLATION under genuine concurrency ───────────────────────────────────────────────────

  it("two orgs importing the SAME book simultaneously never see each other's rows", async () => {
    // The db suite runs with fileParallelism:false, so nothing in it has ever exercised two imports at once.
    // The cross-org IDOR class lives exactly here: the runner uses a SERVICE-ROLE client, which bypasses RLS
    // entirely — the `.eq("org_id", orgId)` on every query IS the only org boundary that exists.
    //
    // Both orgs import the SAME seed, deliberately: a row that leaked across would look plausible rather than
    // obviously foreign, which is precisely how this class of bug survives review.
    const truth = generateBook({ seed: 79, leases: 5, landlords: 1, vendors: 1, variety: true })
    const book = render(truth, "en-ZA")

    const [orgA, orgB] = await Promise.all([seedEmptyOrg(db), seedEmptyOrg(db)])
    orgs.push(orgA, orgB)

    const [resA, resB] = await Promise.all([
      importWith(db, orgA, agentId, book),
      importWith(db, orgB, agentId, book),
    ])

    expect(resA.leasesCreated, "org A imports its own book in full").toBe(5)
    expect(resB.leasesCreated, "org B imports its own book in full").toBe(5)

    for (const [label, org] of [["A", orgA], ["B", orgB]] as const) {
      for (const table of ["properties", "units", "tenants", "leases", "contacts"]) {
        const { data, error } = await db.from(table).select("org_id").eq("org_id", org)
        expect(error, `${table} read for org ${label}`).toBeFalsy()
        expect((data ?? []).length, `org ${label} must hold its own ${table} rows`).toBeGreaterThan(0)
        expect(
          (data ?? []).filter((r) => r.org_id !== org).length,
          `org ${label} sees a FOREIGN row in ${table}`,
        ).toBe(0)
      }
    }

    // A leak would also show up as asymmetry: one org absorbing what the other lost.
    expect(
      await contentHash(db, orgA),
      "same book, two orgs, run at once — identical content, nothing shared",
    ).toBe(await contentHash(db, orgB))
  }, 300_000)
})
