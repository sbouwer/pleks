/**
 * lib/searchworx/rates/sync.ts — the daily rate sync: observe, compare, apply or hold (ADDENDUM_14V §3.3)
 *
 * Auth:   none of its own — server-only; the caller is app/api/cron/searchworx-rate-sync (requireCronAuth).
 * Data:   reads + inserts searchworx_rate_observations and searchworx_rates (platform tables, service client)
 * Notes:  decideRateMoves is PURE and holds every rule of §3.3; runRateSync is the I/O around it and returns
 *         alerts rather than raising them, so the route owns Sentry and the tests own nothing but data.
 *         Per product, against the rate CURRENT today and the newest observation (by observed_at):
 *           · no observation at all → reported (§3.3 step 6 — a rate with no observation path)
 *           · the observation is already linked from a rate row → nothing (re-runs write nothing)
 *           · no current rate → apply (nothing to measure a mismatch against; this is how the first import
 *             becomes the first rates)
 *           · equal → nothing; a mismatch within plausibilityThresholdPct → apply; beyond it → HOLD: no rate row,
 *             one alert naming product, old, new and source. The hold re-alerts on every run until an admin
 *             acts, because the alert is the control (§4) and a held rate is not a state to forget.
 *         An applied row is dated to the observation's vendor date, else today (§3.3 step 3), and links
 *         observation_id. A UNIQUE (product_key, effective_date, source) collision is reported, never thrown —
 *         it means two different prices for one product on one vendor date, which a human must read.
 *         Billing is fetched for YESTERDAY (SA). A failed or unreadable fetch records nothing from billing but
 *         the comparison still runs over what is recorded — an outage at the vendor must not also stall the
 *         price-list import's promotion — and the route turns the failure into Sentry + 502.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { addCalendarDays, diffCalendarDays } from "@/lib/dates"
import type { BillingFetch } from "@/lib/searchworx/billingReport"
import { billingObservations } from "@/lib/searchworx/rates/billing"
import { recordObservations, type ObservationSource } from "@/lib/searchworx/rates/observe"
import { selectCurrentRates, type RateRow } from "@/lib/searchworx/rates/read"
import { VENDOR_NAME_TO_PRODUCT } from "@/lib/searchworx/rates/productNames"

export interface LinkedRateRow extends RateRow {
  observation_id: string | null
}

export interface LatestObservation {
  id: string
  product_key: string
  cost_excl_vat_cents: number
  source: ObservationSource
  observed_at: string
  raw: Record<string, unknown> | null
}

export type RateDecision =
  | { kind: "no_observation"; productKey: string; hasRate: boolean }
  | { kind: "unchanged"; productKey: string; reason: "equal" | "already_applied" }
  | { kind: "apply"; productKey: string; observation: LatestObservation; effectiveDate: string; fromCents: number | null }
  | { kind: "hold"; productKey: string; observation: LatestObservation; fromCents: number; pct: number }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Every product the name table maps — the set "in use" (§3.3). */
const SYNCED_PRODUCT_KEYS: readonly string[] = [
  ...new Set(Object.values(VENDOR_NAME_TO_PRODUCT).map((v) => v.productKey)),
].sort((a, b) => a.localeCompare(b))

function vendorDay(o: LatestObservation): string | null {
  const d = o.raw?.vendor_effective_date
  return typeof d === "string" && ISO_DAY.test(d) ? d : null
}

export function decideRateMoves(args: {
  productKeys: readonly string[]
  rateRows: readonly LinkedRateRow[]
  latest: ReadonlyMap<string, LatestObservation>
  thresholdPct: number
  today: string
}): RateDecision[] {
  const { rates } = selectCurrentRates(args.rateRows, args.productKeys, args.today)
  const applied = new Set(args.rateRows.map((r) => r.observation_id).filter((id): id is string => id !== null))

  return args.productKeys.map((productKey): RateDecision => {
    const current = rates.get(productKey)
    const obs = args.latest.get(productKey)
    if (!obs) return { kind: "no_observation", productKey, hasRate: current !== undefined }
    if (applied.has(obs.id)) return { kind: "unchanged", productKey, reason: "already_applied" }

    const effectiveDate = vendorDay(obs) ?? args.today
    if (!current) return { kind: "apply", productKey, observation: obs, effectiveDate, fromCents: null }

    const from = current.costExclVatCents
    const to = obs.cost_excl_vat_cents
    if (from === to) return { kind: "unchanged", productKey, reason: "equal" }

    const pct = from === 0 ? Number.POSITIVE_INFINITY : (Math.abs(to - from) / from) * 100
    if (pct > args.thresholdPct) return { kind: "hold", productKey, observation: obs, fromCents: from, pct }
    return { kind: "apply", productKey, observation: obs, effectiveDate, fromCents: from }
  })
}

/** Products whose newest observation is older than the stale window (§3.3 step 5). Never blocks quoting. */
export function staleProducts(args: {
  latest: ReadonlyMap<string, LatestObservation>
  staleAfterDays: number
  today: string
}): { productKey: string; days: number }[] {
  const out: { productKey: string; days: number }[] = []
  for (const [productKey, o] of args.latest) {
    const days = diffCalendarDays(new Date(o.observed_at), args.today)
    if (days > args.staleAfterDays) out.push({ productKey, days })
  }
  return out
}

export interface SyncAlert {
  level: "error" | "warning"
  message: string
  extra: Record<string, string | number | null>
}

export interface SyncResult {
  billingDay: string
  /** Null when billing was fetched and read cleanly (including a quiet day). */
  sourceFailure: string | null
  summary: {
    billing_rows: number
    recorded: number
    applied: number
    held: number
    unchanged: number
    stale: number
    no_observation: number
    conflicts: number
    unmapped: number
    rejected: number
  }
  alerts: SyncAlert[]
}

async function recordBilling(
  db: SupabaseClient,
  fetched: BillingFetch,
  billingDay: string,
  result: SyncResult,
): Promise<void> {
  if (!fetched.ok) {
    result.sourceFailure = `billing report unavailable for ${billingDay}: ${fetched.error}`
    return
  }
  result.summary.billing_rows = fetched.rows.length
  const parsed = billingObservations(fetched.rows, billingDay)
  result.summary.unmapped = parsed.unmapped.length
  result.summary.rejected = parsed.rejected.length
  if (parsed.rejected.length > 0) {
    result.sourceFailure = `billing report for ${billingDay} has ${parsed.rejected.length} unreadable row(s) — nothing recorded: ${parsed.rejected
      .slice(0, 3)
      .map((r) => `#${r.index} ${r.reason}`)
      .join("; ")}`
    return
  }
  if (parsed.unmapped.length > 0) {
    result.alerts.push({
      level: "warning",
      message: "searchworx-rate-sync: billed search types with no product_key — add them to productNames.ts",
      extra: { billing_day: billingDay, names: parsed.unmapped.join(" | ") },
    })
  }

  const { data: existing, error } = await db
    .from("searchworx_rate_observations")
    .select("raw")
    .eq("source", "billing_report")
    .eq("raw->>bill_day", billingDay)
  if (error) throw new Error(`runRateSync: billing observation read failed — ${error.message}`)
  const seen = new Set<unknown>((existing ?? []).map((r: { raw: Record<string, unknown> | null }) => r.raw?.billing_key))
  const fresh = parsed.observations.filter((o) => !seen.has(o.raw?.billing_key))
  result.summary.recorded = await recordObservations(db, fresh)
}

async function readLatest(db: SupabaseClient, productKeys: readonly string[]): Promise<Map<string, LatestObservation>> {
  const rows = await Promise.all(
    productKeys.map(async (k) => {
      const { data, error } = await db
        .from("searchworx_rate_observations")
        .select("id, product_key, cost_excl_vat_cents, source, observed_at, raw")
        .eq("product_key", k)
        .order("observed_at", { ascending: false })
        .limit(1)
      if (error) throw new Error(`runRateSync: observation read failed for ${k} — ${error.message}`)
      return (data?.[0] ?? null) as LatestObservation | null
    }),
  )
  return new Map(rows.filter((r): r is LatestObservation => r !== null).map((r) => [r.product_key, r]))
}

async function applyRate(db: SupabaseClient, d: Extract<RateDecision, { kind: "apply" }>, result: SyncResult): Promise<void> {
  const { error } = await db.from("searchworx_rates").insert({
    product_key: d.productKey,
    cost_excl_vat_cents: d.observation.cost_excl_vat_cents,
    effective_date: d.effectiveDate,
    source: d.observation.source,
    observation_id: d.observation.id,
    notes: `searchworx-rate-sync from ${d.observation.source} (was ${d.fromCents ?? "none"})`,
  })
  if (!error) {
    result.summary.applied++
    return
  }
  if (error.code !== "23505") throw new Error(`runRateSync: rate insert failed for ${d.productKey} — ${error.message}`)
  result.summary.conflicts++
  result.alerts.push({
    level: "error",
    message: "searchworx-rate-sync: a second price for one product on one vendor date — not applied",
    extra: {
      product_key: d.productKey,
      effective_date: d.effectiveDate,
      source: d.observation.source,
      observation_id: d.observation.id,
      new_cents: d.observation.cost_excl_vat_cents,
    },
  })
}

export async function runRateSync(
  db: SupabaseClient,
  deps: {
    today: string
    fetchBilling: (dayISO: string) => Promise<BillingFetch>
    thresholdPct: number
    staleAfterDays: number
    productKeys?: readonly string[]
  },
): Promise<SyncResult> {
  const productKeys = deps.productKeys ?? SYNCED_PRODUCT_KEYS
  const billingDay = addCalendarDays(deps.today, -1)
  const result: SyncResult = {
    billingDay,
    sourceFailure: null,
    summary: { billing_rows: 0, recorded: 0, applied: 0, held: 0, unchanged: 0, stale: 0, no_observation: 0, conflicts: 0, unmapped: 0, rejected: 0 },
    alerts: [],
  }

  await recordBilling(db, await deps.fetchBilling(billingDay), billingDay, result)

  const { data: rateRows, error } = await db
    .from("searchworx_rates")
    .select("product_key, cost_excl_vat_cents, effective_date, source, observation_id")
    .in("product_key", [...productKeys])
  if (error) throw new Error(`runRateSync: searchworx_rates read failed — ${error.message}`)
  const latest = await readLatest(db, productKeys)

  const decisions = decideRateMoves({
    productKeys,
    rateRows: (rateRows ?? []) as LinkedRateRow[],
    latest,
    thresholdPct: deps.thresholdPct,
    today: deps.today,
  })

  // One insert per product, independent of each other — concurrent, never a partial-batch rollback to reason about.
  await Promise.all(decisions.filter((d) => d.kind === "apply").map((d) => applyRate(db, d, result)))

  for (const d of decisions) {
    if (d.kind === "apply") continue
    if (d.kind === "unchanged") result.summary.unchanged++
    else if (d.kind === "no_observation") result.summary.no_observation++
    else {
      result.summary.held++
      result.alerts.push({
        level: "error",
        message: `searchworx-rate-sync: ${d.productKey} HELD — observed price moved ${d.pct.toFixed(1)}%, beyond the ${deps.thresholdPct}% guard`,
        extra: {
          product_key: d.productKey,
          old_cents: d.fromCents,
          new_cents: d.observation.cost_excl_vat_cents,
          source: d.observation.source,
          observation_id: d.observation.id,
        },
      })
    }
  }

  const stale = staleProducts({ latest, staleAfterDays: deps.staleAfterDays, today: deps.today })
  result.summary.stale = stale.length
  for (const s of stale) {
    result.alerts.push({
      level: "warning",
      message: `searchworx-rate-sync: ${s.productKey} has had no price observation for ${s.days} days`,
      extra: { product_key: s.productKey, days: s.days },
    })
  }
  return result
}
