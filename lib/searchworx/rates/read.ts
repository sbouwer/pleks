/**
 * lib/searchworx/rates/read.ts — the current recorded Searchworx rate per product (ADDENDUM_14V §3.1)
 *
 * Auth:   none of its own — reads a platform table (no org_id; SELECT is open to authenticated) through the
 *         service client so cron and server code read the same rows.
 * Data:   searchworx_rates (append-only)
 * Notes:  Current rate = the greatest effective_date on or before as-at; a tie goes admin_override >
 *         billing_report > pull_observed > pricelist_import (the vendor's own statement of what it charged
 *         outranks any list). A product with no qualifying row is MISSING — never zero (§4, §5).
 */
import { createServiceClient } from "@/lib/supabase/server"
import type { CurrentRate } from "@/lib/screening/pricing"

export type RateSource = "pricelist_import" | "pull_observed" | "billing_report" | "admin_override"

export interface RateRow {
  product_key: string
  cost_excl_vat_cents: number
  effective_date: string
  source: RateSource
}

const SOURCE_RANK: Record<RateSource, number> = {
  admin_override: 4,
  billing_report: 3,
  pull_observed: 2,
  pricelist_import: 1,
}

export interface CurrentRates {
  rates: Map<string, CurrentRate>
  missing: string[]
}

/** Pure selection over already-read rows. */
export function selectCurrentRates(rows: readonly RateRow[], productKeys: readonly string[], asAt: string): CurrentRates {
  const best = new Map<string, RateRow>()
  for (const r of rows) {
    if (r.effective_date > asAt || !productKeys.includes(r.product_key)) continue
    const cur = best.get(r.product_key)
    if (
      !cur ||
      r.effective_date > cur.effective_date ||
      (r.effective_date === cur.effective_date && SOURCE_RANK[r.source] > SOURCE_RANK[cur.source])
    ) {
      best.set(r.product_key, r)
    }
  }
  const rates = new Map<string, CurrentRate>()
  for (const [k, r] of best) rates.set(k, { productKey: k, costExclVatCents: r.cost_excl_vat_cents, effectiveDate: r.effective_date })
  return { rates, missing: productKeys.filter((k) => !rates.has(k)) }
}

/**
 * Reads every row on or before as-at for the products and selects. A read failure THROWS — it is not "no rate".
 *
 * @knipignore ADDENDUM_14V §7 step 7 (the consumer sweep, after BUILD_72 Phase 1 merges) lands its callers.
 * The step-6 cron does not call it: it needs each row's observation_id, so it reads the rows itself and uses
 * selectCurrentRates. Built in step 4 with the formula, per the spec. Remove this tag with the first caller.
 */
export async function currentRates(productKeys: readonly string[], asAt: string): Promise<CurrentRates> {
  const db = await createServiceClient()
  const { data, error } = await db
    .from("searchworx_rates")
    .select("product_key, cost_excl_vat_cents, effective_date, source")
    .in("product_key", [...productKeys])
    .lte("effective_date", asAt)
  if (error) throw new Error(`currentRates: searchworx_rates read failed — ${error.message}`)
  return selectCurrentRates((data ?? []) as RateRow[], productKeys, asAt)
}
