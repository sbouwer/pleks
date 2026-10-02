/**
 * lib/searchworx/rates/importPriceList.ts — imports a Searchworx price-list export as observations (ADDENDUM_14V §3.2)
 *
 * Auth:   none of its own — the admin route that calls it is the gate.
 * Data:   inserts searchworx_rate_observations (source `pricelist_import`); never writes searchworx_rates
 * Notes:  The list is the forward-looking source — the ceiling for products the account has not bought yet
 *         (§9.6). It records what the list SAYS; the daily cron decides whether a rate moves (§3.3), so an
 *         import is evidence and can never reprice anything on its own. Unmapped names are reported and the
 *         mapped rows still commit (§5). A list with rejected lines or no mapped row commits NOTHING: a
 *         truncated or reshuffled export is the failure §9.2 guards, and half of one is worse than none.
 *         The vendor's printed date is stored as metadata (vendor_effective_date) and a list already older than
 *         staleAfterDays on arrival is reported back as a warning; it never blocks the import (§4: staleness is an
 *         observation problem, not a quoting one).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { parsePriceList, type PriceListReport } from "@/lib/searchworx/rates/priceList"
import { recordObservations } from "@/lib/searchworx/rates/observe"
import { diffCalendarDays, saTodayISO } from "@/lib/dates"
import { PRICING_POLICY } from "@/lib/screening/pricingPolicy.v1"

export type ImportResult =
  | { ok: true; recorded: number; report: PriceListReport; staleOnArrival: StaleOnArrival | null }
  | { ok: false; reason: "rejected_lines" | "nothing_mapped"; report: PriceListReport }

/** §8 (ruled 2026-10-01): a list whose printed date is older than staleAfterDays on arrival WARNS — it still imports. */
export interface StaleOnArrival {
  vendorEffectiveDate: string
  ageDays: number
  staleAfterDays: number
}

export function staleOnArrival(vendorEffectiveDate: string, today: string, staleAfterDays: number): StaleOnArrival | null {
  const ageDays = diffCalendarDays(vendorEffectiveDate, today)
  return ageDays > staleAfterDays ? { vendorEffectiveDate, ageDays, staleAfterDays } : null
}

export async function importPriceList(
  db: SupabaseClient,
  {
    csv,
    filename,
    vendorEffectiveDate,
    importId = null,
    createdBy = null,
    today = saTodayISO(),
  }: {
    csv: string
    filename: string
    vendorEffectiveDate: string
    importId?: string | null
    createdBy?: string | null
    today?: string
  },
): Promise<ImportResult> {
  const report = parsePriceList(csv)
  if (report.rejected.length > 0) return { ok: false, reason: "rejected_lines", report }
  if (report.mapped.length === 0) return { ok: false, reason: "nothing_mapped", report }

  const recorded = await recordObservations(
    db,
    report.mapped.map((m) => ({
      productKey: m.productKey,
      costExclVatCents: m.cents,
      source: "pricelist_import" as const,
      sourceRef: `${filename}:${m.line}`,
      mappingConfidence: m.confidence,
      vendorEffectiveDate,
      raw: { vendor_name: m.name, line: m.line, import_id: importId },
      createdBy,
    })),
  )
  return { ok: true, recorded, report, staleOnArrival: staleOnArrival(vendorEffectiveDate, today, PRICING_POLICY.staleAfterDays) }
}
