/**
 * test/db/searchworx-rates-rls.dbtest.ts — a planted open SELECT on Pleks's supplier-cost tables is a Cat 7 CRITICAL (ADDENDUM_14V step 7)
 *
 * Auth:   service-role client + raw psql vs LOCAL Supabase (npm run test:db)
 * Notes:  #324 shipped searchworx_rates with a SELECT-for-authenticated USING (true) copied from prime_rates, and
 *         security:db failed CI on it. This makes that a standing probe rather than a one-off catch: plant the
 *         same policy on each cost table, read it back through get_rls_audit() — the RPC security:db reads — and
 *         judge it with openPolicyVerdict, the function Cat 7 itself calls (scripts/security/open-policy.mjs).
 *         "open" is what Cat 7 records as a CRITICAL finding, and a CRITICAL fails `security:db --ci`.
 *
 *         Both directions: the tables as migrated carry no open policy, and prime_rates' own SELECT USING (true)
 *         still reads "allowed" — so a verdict function that called everything open would fail here too.
 */
import { afterAll, describe, expect, it } from "vitest"
import { psql, svc } from "@/test/db/tier"
import { openPolicyVerdict } from "@/scripts/security/open-policy.mjs"

const PLANTED = "probe_open_select_14v"
const COST_TABLES = ["searchworx_rates", "searchworx_rate_observations"] as const

type AuditRow = { tablename: string; policyname: string; cmd: string; qual: string | null }

async function verdicts(table: string): Promise<{ policy: string; verdict: string | null }[]> {
  const { data, error } = await svc().rpc("get_rls_audit")
  if (error) throw new Error(`get_rls_audit failed: ${error.message}`)
  return (data as AuditRow[])
    .filter((r) => r.tablename === table)
    .map((r) => ({ policy: r.policyname, verdict: openPolicyVerdict(table, r) }))
}

afterAll(() => {
  for (const t of COST_TABLES) psql(`DROP POLICY IF EXISTS ${PLANTED} ON public.${t};`)
})

describe("Cat 7 on the Searchworx cost tables", () => {
  for (const table of COST_TABLES) {
    it(`KNOWN-GOOD: ${table} as migrated carries no open policy`, async () => {
      expect((await verdicts(table)).filter((v) => v.verdict !== null)).toEqual([])
    })

    it(`PLANTED: a SELECT USING (true) for authenticated on ${table} is "open" — a CRITICAL`, async () => {
      psql(`CREATE POLICY ${PLANTED} ON public.${table} FOR SELECT TO authenticated USING (true);`)
      try {
        expect(await verdicts(table)).toContainEqual({ policy: PLANTED, verdict: "open" })
      } finally {
        psql(`DROP POLICY IF EXISTS ${PLANTED} ON public.${table};`)
      }
    })
  }

  it("KNOWN-GOOD: prime_rates' own SELECT USING (true) is still allowed — the verdict discriminates", async () => {
    expect((await verdicts("prime_rates")).map((v) => v.verdict)).toContain("allowed")
  })
})
