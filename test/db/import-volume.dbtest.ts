/**
 * test/db/import-volume.dbtest.ts — the ceiling. Where does the import actually break?
 *
 * Auth:   service-role client vs LOCAL Supabase
 * Run:    RUN_VOLUME=1 npm run test:db     (opt-in — this is the NIGHTLY tier, not the CI tier)
 *
 * Notes:  Every other test in this suite runs a Steward-sized book — a hundred leases at most. That is the
 *         shape of our smallest paying customer, and it tells us nothing about our largest.
 *
 *         A Portfolio agency has 75 leases. A Firm has 150. A Bespoke prospect arrives with FOUR THOUSAND, and
 *         the very first thing they do — before they trust us with anything — is upload their book. If the
 *         import times out, or the payload is rejected, or it silently truncates at some limit nobody has ever
 *         looked for, we lose the customer in the first five minutes and never learn why.
 *
 *         So the number to know is not "does 100 work". It is: WHERE IS THE CLIFF, and what does falling off it
 *         look like? A slow import is a support ticket. A SILENTLY TRUNCATED one is a corrupt book that the
 *         agency will trust — and that is this harness's entire subject.
 *
 *         Opt-in because it is minutes, not seconds. It belongs in the nightly digest, not on every PR.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping, toImportDecisions } from "@/lib/import/decisions"
import { runImport } from "@/lib/import/importRunner"
import { generateBook } from "@/test/import/book"
import { render } from "@/test/import/dialect"
import { reconcileLeases, checkInvariants } from "@/test/import/reconcile"

const db = svc()

// Opt-in. `describe.skipIf` rather than a silent no-op, so the suite SAYS it did not run this tier.
const VOLUME = process.env.RUN_VOLUME === "1"

describe.skipIf(!VOLUME)("VOLUME — where is the cliff?", () => {
  let agentId: string
  const orgs: string[] = []

  beforeAll(() => { agentId = seedUser() })
  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    teardownUser(agentId)
  })

  it("climbs 100 → 500 → 1 000 → 2 000 leases and reports where it degrades", async () => {
    const timings: string[] = []
    const failures: string[] = []

    for (const size of [100, 500, 1_000, 2_000]) {
      const truth = generateBook({ seed: 900 + size, leases: size, variety: true })
      const book = render(truth, "af-ZA")          // the locale most likely to expose a parsing cost

      const org = await seedEmptyOrg(db)
      orgs.push(org)

      const suggestions = matchColumns(book.headers)
      const w: Record<string, { field: string; entity: string }> = {}
      for (const s of suggestions) if (s.field) w[s.column] = { field: s.field, entity: s.entity }

      const t0 = performance.now()
      const result = await runImport(
        book.rows, toColumnMapping(w),
        toImportDecisions({
          columnMapping: w, expiredLeaseAction: "import_as_expired",
          bankConsentAttested: true, depositsHeldAttested: true,
        }),
        org, agentId, undefined, db,
      )
      const seconds = (performance.now() - t0) / 1000

      const findings = await reconcileLeases(db, org, truth, result)
      const breaches = await checkInvariants(db, org, truth, result)
      const silent = findings.filter((f) => f.silent)

      timings.push(
        `  ${String(size).padStart(5)} leases · ${seconds.toFixed(1)}s ` +
        `(${(seconds / size * 1000).toFixed(0)} ms/lease) · ${result.leasesCreated} created` +
        `${silent.length ? ` · ✗ ${silent.length} SILENT` : ""}` +
        `${breaches.length ? ` · ✗ ${breaches.length} invariant breach(es)` : ""}`,
      )

      // THE CLIFF IS NOT SLOWNESS — it is a book that half-arrives and says nothing. Slowness is a support
      // ticket; silent truncation is a corrupt ledger the agency will trust.
      if (result.leasesCreated !== size) {
        failures.push(
          `at ${size} leases only ${result.leasesCreated} were created. ` +
          `${result.errors.length} message(s) — if that number is 0, the book was SILENTLY TRUNCATED.`,
        )
      }
      for (const f of silent) failures.push(`at ${size}: row ${f.row} · ${f.field} landed wrong, in silence`)
      for (const b of breaches) failures.push(`at ${size}: INVARIANT ${b.invariant} — ${b.detail}`)
    }

    console.log(`\n── volume ──\n${timings.join("\n")}\n`)

    expect(
      failures,
      "the book must arrive WHOLE at every size, or say plainly which rows did not. A Bespoke prospect's " +
      "first act is to upload four thousand leases; if we truncate them in silence we lose them in five " +
      "minutes and never find out why.",
    ).toEqual([])
  }, 3_600_000)
})
