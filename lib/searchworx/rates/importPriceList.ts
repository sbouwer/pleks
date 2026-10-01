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
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { parsePriceList, type PriceListReport } from "@/lib/searchworx/rates/priceList"
import { recordObservations } from "@/lib/searchworx/rates/observe"

export type ImportResult =
  | { ok: true; recorded: number; report: PriceListReport }
  | { ok: false; reason: "rejected_lines" | "nothing_mapped"; report: PriceListReport }

export async function importPriceList(
  db: SupabaseClient,
  {
    csv,
    filename,
    vendorEffectiveDate,
    importId = null,
    createdBy = null,
  }: { csv: string; filename: string; vendorEffectiveDate: string; importId?: string | null; createdBy?: string | null },
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
  return { ok: true, recorded, report }
}
