/**
 * lib/searchworx/rates/reconcile.ts — billed UnitPrice back onto the line or pull that made the call (ADDENDUM_14V §3.6)
 *
 * Auth:   none of its own — server-only; called by runRateSync, whose caller is the cron (requireCronAuth).
 * Data:   updates application_screening_lines (cost_cents), property_intelligence_pulls (cost_cents) and the
 *         searchworx vendor_usage row of a pull (cost_cents)
 * Notes:  Every Searchworx call sends Reference = the id of the row it is for, minted before the call
 *         (bundle-runner's line id, the PI pull id). The billing report echoes it, so billed rows name a row of
 *         ours. What was actually charged OVERWRITES the estimate (ruled 2026-10-02); an unbilled row keeps it.
 *         What was charged is the SUM over every billed row carrying that Reference and product, each
 *         Quantity × UnitPrice — the caller passes the whole bill day on every run, so the sum is idempotent.
 *         rate_effective_date is NOT touched: its column COMMENT (005) makes it the searchworx_rates row the
 *         estimate was quoted from, so a margin report joins actual cost to the QUOTED rate (walker F5).
 *         CROSS-ORG BY CONSTRUCTION: this is the platform's own reconcile across every org's lines. It is
 *         bounded by the id the vendor echoed AND the product the vendor billed — a reference that is not a
 *         UUID (calls made before this change used `<application>-<run>` or an erf number) is skipped, and a
 *         reference naming a row of a different product updates nothing.
 *         A PI pull's stamp (cost_excl_vat_cents, the quote) is never touched: cost_cents is the actual cost,
 *         the stamp is what the fee was priced from, and a margin report needs both.
 *         A failed write is returned as a failure for the cron to alert on; it never aborts the rate sync.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Observation } from "@/lib/searchworx/rates/observe"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ReconcileResult {
  lines: number
  pulls: number
  failures: string[]
}

/** Billed cost per (Reference, product): Σ Quantity × UnitPrice. A non-UUID Reference never reaches a query. */
export function billedTotals(billed: readonly Observation[]): { sourceRef: string; productKey: string; costExclVatCents: number }[] {
  const totals = new Map<string, { sourceRef: string; productKey: string; costExclVatCents: number }>()
  for (const o of billed) {
    if (o.source !== "billing_report" || !UUID.test(o.sourceRef)) continue
    const quantity = typeof o.raw?.quantity === "number" ? o.raw.quantity : 1
    const key = `${o.sourceRef}|${o.productKey}`
    const t = totals.get(key) ?? { sourceRef: o.sourceRef, productKey: o.productKey, costExclVatCents: 0 }
    t.costExclVatCents += quantity * o.costExclVatCents
    totals.set(key, t)
  }
  return [...totals.values()]
}

export async function reconcileBilledCosts(db: SupabaseClient, billed: readonly Observation[]): Promise<ReconcileResult> {
  const out: ReconcileResult = { lines: 0, pulls: 0, failures: [] }
  for (const o of billedTotals(billed)) {
    // CROSS-ORG BY CONSTRUCTION (header): bounded by the vendor-echoed row id AND the billed product, never by
    // org. pleks/require-org-scope-on-service-write cannot see this write (`db` is a parameter), so the
    // classification lives here rather than in a directive the rule would report as unused.
    const { data: lines, error: lineErr } = await db
      .from("application_screening_lines")
      .update({ cost_cents: o.costExclVatCents })
      .eq("id", o.sourceRef)
      .eq("product_key", o.productKey)
      .select("id")
    if (lineErr) {
      out.failures.push(`screening line ${o.sourceRef}: ${lineErr.message}`)
      continue
    }
    if (lines && lines.length > 0) {
      out.lines += lines.length
      continue
    }

    const { data: pulls, error: pullErr } = await db
      .from("property_intelligence_pulls")
      .update({ cost_cents: o.costExclVatCents })
      .eq("id", o.sourceRef)
      .eq("product_type", o.productKey)
      .select("id")
    if (pullErr) {
      out.failures.push(`pi pull ${o.sourceRef}: ${pullErr.message}`)
      continue
    }
    if (!pulls || pulls.length === 0) continue
    out.pulls += pulls.length

    const { error: usageErr } = await db
      .from("vendor_usage")
      .update({ cost_cents: o.costExclVatCents })
      .eq("ref_table", "property_intelligence_pulls")
      .eq("ref_id", o.sourceRef)
      .eq("vendor", "searchworx")
    if (usageErr) out.failures.push(`vendor_usage for pull ${o.sourceRef}: ${usageErr.message}`)
  }
  return out
}
