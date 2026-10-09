/**
 * vitest.db.config.ts — DB-integration test tier (runs against a LOCAL Supabase stack)
 *
 * Notes:  Separate from vitest.config.ts (pure-function). Runs `*.dbtest.ts` files only, which hit a
 *         real Postgres via the service-role client. Requires `npx supabase start` to be up. `next/headers`
 *         is aliased to a throwing stub (DB code imports server.ts which imports it but never calls it).
 *         Invoke with `npm run test:db`; the pure-function `npm test` excludes these.
 *
 *         TWO PROJECTS, run one after the other (groupOrder). `parallel` runs its files concurrently: each
 *         seeds and tears down its own random org, so they share a database but no rows. `serial` holds
 *         the files that reach across orgs, and runs them one at a time once `parallel` has finished.
 *         The whole tier ran serially until 2026-10-09 (~185s locally against ~51s parallel). The
 *         classification of all 46 files is .handoff/ci-faster-gates/01-census.md.
 *
 *         A NEW dbtest lands in `parallel` by default. It belongs in SERIAL if it:
 *           · calls code that reads or writes across ALL orgs (a cron, a sweep, a claim runner);
 *           · asserts a count over a whole table, or reads rows it did not create;
 *           · runs DDL or TRUNCATE. To force a DB failure, use the org-scoped injectors in
 *             test/db/tier.ts; never CREATE a trigger mid-run (it deadlocked this tier, 2026-10-09).
 *         Nothing checks a new file's placement. A `>=` over rows other files also create passes MORE
 *         easily in parallel, so that failure is toward green.
 */
import { defineConfig } from "vitest/config"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Files that reach across orgs. Each reason is the census row for that file. */
const SERIAL = [
  // sweepStrandedClaims over ALL orgs, and asserts `swept >= 2` — a global count.
  "test/db/screening-claim-recovery.dbtest.ts",
  // the screening-line-runner cron: the same sweep, then claims ready_to_run lines with no org filter.
  "test/db/residential-screening-e2e.dbtest.ts",
  // CREATE POLICY on the global searchworx_rates tables; the RLS audit reads the whole schema.
  "test/db/searchworx-rates-rls.dbtest.ts",
  // TRUNCATE screening_notification_events (refused by a trigger, but it takes the lock first).
  "test/db/notification-trail-immutable.dbtest.ts",
]

const shared = {
  environment: "node" as const,
  globalSetup: ["./test/db/global-setup.ts"],
  setupFiles: ["./test/db/setup.ts"],
  testTimeout: 30_000,
  hookTimeout: 30_000,
}

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { ...shared, name: "parallel", include: ["**/*.dbtest.ts"], exclude: ["**/node_modules/**", ...SERIAL], sequence: { groupOrder: 0 } },
      },
      {
        extends: true,
        test: { ...shared, name: "serial", include: SERIAL, fileParallelism: false, sequence: { groupOrder: 1 } },
      },
    ],
  },
  resolve: {
    alias: {
      "next/headers": resolve(__dirname, "test/db/next-headers-stub.ts"),
      "@": resolve(__dirname, "."),
    },
  },
})
