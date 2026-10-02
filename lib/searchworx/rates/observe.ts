/**
 * lib/searchworx/rates/observe.ts — records sightings of a vendor price (ADDENDUM_14V §3.2)
 *
 * Auth:   none of its own — server-only; callers are the admin price-list import and the daily rate cron.
 * Data:   inserts searchworx_rate_observations (service client; the table has no policy at all)
 * Notes:  One interface for every source. An observation is raw evidence, written BEFORE any decision: whether
 *         it moves a rate is the cron's call (§3.3), so nothing here touches searchworx_rates.
 *         POPIA (§3.2b): `raw` must never carry a search subject. Callers build it from product, amount and
 *         date only; a billing row's Description is never passed in.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { MappingConfidence } from "@/lib/searchworx/rates/productNames"

export type ObservationSource = "pricelist_import" | "pull_observed" | "billing_report"

export interface Observation {
  productKey: string
  costExclVatCents: number
  source: ObservationSource
  sourceRef: string
  /** How the vendor name became this product_key (§3.2, ruled 2026-10-01). Defaults to exact. */
  mappingConfidence?: MappingConfidence
  /** The vendor's own date for this price, when the source carries one (YYYY-MM-DD). */
  vendorEffectiveDate?: string | null
  raw?: Record<string, string | number | null>
  createdBy?: string | null
}

/** Inserts the batch in one statement; a failure THROWS so a caller can never report a partial import as done. */
export async function recordObservations(db: SupabaseClient, observations: readonly Observation[]): Promise<number> {
  if (observations.length === 0) return 0
  const { error } = await db.from("searchworx_rate_observations").insert(
    observations.map((o) => ({
      product_key: o.productKey,
      cost_excl_vat_cents: o.costExclVatCents,
      source: o.source,
      source_ref: o.sourceRef,
      mapping_confidence: o.mappingConfidence ?? "exact",
      raw: { ...o.raw, vendor_effective_date: o.vendorEffectiveDate ?? null },
      created_by: o.createdBy ?? null,
    })),
  )
  if (error) throw new Error(`recordObservations: insert failed — ${error.message}`)
  return observations.length
}
