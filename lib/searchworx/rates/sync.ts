/**
 * lib/searchworx/rates/sync.ts — the daily rate sync: observe, compare, apply or hold (ADDENDUM_14V §3.3)
 *
 * Auth:   none of its own — server-only; the caller is app/api/cron/searchworx-rate-sync (requireCronAuth).
 * Data:   reads + inserts searchworx_rate_observations, searchworx_rates and searchworx_rate_holds (platform
 *         tables, service client)
 * Notes:  decideRateMoves is PURE and holds every rule of §3.3; runRateSync is the I/O around it and returns
 *         alerts rather than raising them, so the route owns Sentry and the tests own nothing but data.
 *         SOURCE HIERARCHY (ruled 2026-10-01): a product that has EVER been billed (a billing_report or
 *         pull_observed observation exists) is compared against its newest vendor-statement observation only —
 *         a list import never moves it. A list price BELOW the billed rate is a warning (on the run after the
 *         import), because a list under the contract price means one of the two is wrong. read.ts applies the
 *         same rule to rate rows, so a list row written before the first billing row cannot outrank it later.
 *         Per product, against the rate CURRENT today and that candidate observation:
 *           · no observation at all → reported (§3.3 step 6 — a rate with no observation path)
 *           · the observation is already linked from a rate row → nothing (re-runs write nothing)
 *           · no current rate → apply (how the first import becomes the first rates)
 *           · equal → nothing; a move within plausibilityThresholdPct → apply; beyond it → HOLD
 *         A HOLD is a searchworx_rate_holds row per (product, value). The cron alerts only when it INSERTS that
 *         row, so a held value alerts once, not every morning (ruled 2026-10-01); it stays counted in `held`
 *         on every run until an admin decides it. A rejected value is never applied or re-alerted; an
 *         admin-applied value is applied by the cron when it is observed again.
 *         An applied row is dated to the day it applies to quoting (§8, ruled 2026-10-01): a billing row's billed
 *         day, a list's IMPORT day — never the list's printed date, which is metadata — and links observation_id. A UNIQUE (product_key, effective_date, source) collision is reported, never thrown.
 *         Billing is fetched for one day — yesterday (SA) unless the caller backfills a date. A failed or
 *         unreadable fetch records nothing from billing but the comparison still runs over what is recorded,
 *         and the route turns the failure into Sentry + 502.
 *         A cleanly read billing day is also RECONCILED (reconcile.ts): each billed row's UnitPrice replaces the
 *         estimated cost on the screening line or PI pull its Reference names. All of the day's rows, not only
 *         the newly recorded ones, so a backfill re-run completes a reconcile an earlier run did not finish.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { addCalendarDays, diffCalendarDays, saDateISO } from "@/lib/dates"
import type { BillingFetch } from "@/lib/searchworx/billingReport"
import { billingObservations } from "@/lib/searchworx/rates/billing"
import { recordObservations, type ObservationSource } from "@/lib/searchworx/rates/observe"
import { selectCurrentRates, type RateRow } from "@/lib/searchworx/rates/read"
import { VENDOR_NAME_TO_PRODUCT } from "@/lib/searchworx/rates/productNames"
import { reconcileBilledCosts } from "@/lib/searchworx/rates/reconcile"

export interface LinkedRateRow extends RateRow {
  observation_id: string | null
}

export interface LatestObservation {
  id: string
  product_key: string
  cost_excl_vat_cents: number
  source: ObservationSource
  observed_at: string
  /** The vendor's own date for the price (a column since ADDENDUM_14V step 7; was raw.vendor_effective_date). */
  vendor_effective_date: string | null
  raw: Record<string, unknown> | null
}

export type HoldStatus = "held" | "applied" | "rejected"

/** Newest observation per product, split by kind — the hierarchy needs both. */
export interface ProductObservations {
  /** Newest billing_report / pull_observed observation: the vendor's own statement. */
  billed: LatestObservation | null
  /** Newest pricelist_import observation. */
  list: LatestObservation | null
}

export type RateDecision =
  | { kind: "no_observation"; productKey: string; hasRate: boolean }
  | { kind: "unchanged"; productKey: string; reason: "equal" | "already_applied" }
  | { kind: "apply"; productKey: string; observation: LatestObservation; effectiveDate: string; fromCents: number | null }
  | { kind: "hold"; productKey: string; observation: LatestObservation; fromCents: number; pct: number; existing: HoldStatus | null }
  | { kind: "rejected"; productKey: string; observation: LatestObservation }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Every product the name table maps — the set "in use" (§3.3). */
const SYNCED_PRODUCT_KEYS: readonly string[] = [
  ...new Set(Object.values(VENDOR_NAME_TO_PRODUCT).map((v) => v.productKey)),
].sort((a, b) => a.localeCompare(b))

export const holdKey = (productKey: string, cents: number) => `${productKey}|${cents}`

/**
 * The day a rate applies to quoting (ADDENDUM_14V §8, ruled 2026-10-01). A billing row: the billed day. A price
 * list: the day it was IMPORTED — the vendor's printed date is metadata on the observation and never backdates a
 * rate (a list dated April, imported in October, prices nothing before October).
 */
function quotingDay(o: LatestObservation, today: string): string {
  if (o.source === "pricelist_import") return saDateISO(new Date(o.observed_at))
  const d = o.vendor_effective_date
  return typeof d === "string" && ISO_DAY.test(d) ? d : today
}

export function decideRateMoves(args: {
  productKeys: readonly string[]
  rateRows: readonly LinkedRateRow[]
  observations: ReadonlyMap<string, ProductObservations>
  holds: ReadonlyMap<string, HoldStatus>
  thresholdPct: number
  today: string
}): RateDecision[] {
  const { rates } = selectCurrentRates(args.rateRows, args.productKeys, args.today)
  const applied = new Set(args.rateRows.map((r) => r.observation_id).filter((id): id is string => id !== null))

  return args.productKeys.map((productKey): RateDecision => {
    const current = rates.get(productKey)
    const seen = args.observations.get(productKey)
    const obs = seen?.billed ?? seen?.list ?? null // HIERARCHY: once billed, the list never moves the rate
    if (!obs) return { kind: "no_observation", productKey, hasRate: current !== undefined }
    if (applied.has(obs.id)) return { kind: "unchanged", productKey, reason: "already_applied" }

    const effectiveDate = quotingDay(obs, args.today)
    if (!current) return { kind: "apply", productKey, observation: obs, effectiveDate, fromCents: null }

    const from = current.costExclVatCents
    const to = obs.cost_excl_vat_cents
    if (from === to) return { kind: "unchanged", productKey, reason: "equal" }

    const pct = from === 0 ? Number.POSITIVE_INFINITY : (Math.abs(to - from) / from) * 100
    if (pct <= args.thresholdPct) return { kind: "apply", productKey, observation: obs, effectiveDate, fromCents: from }

    const existing = args.holds.get(holdKey(productKey, to)) ?? null
    if (existing === "rejected") return { kind: "rejected", productKey, observation: obs }
    if (existing === "applied") return { kind: "apply", productKey, observation: obs, effectiveDate, fromCents: from }
    return { kind: "hold", productKey, observation: obs, fromCents: from, pct, existing }
  })
}

/**
 * Billed products whose newest list price is BELOW the billed current rate, reported on the run after the
 * list was imported (observed today or yesterday) so one import warns once, not daily.
 */
function listBelowBilled(args: {
  productKeys: readonly string[]
  rateRows: readonly LinkedRateRow[]
  observations: ReadonlyMap<string, ProductObservations>
  today: string
}): { productKey: string; listCents: number; billedCents: number }[] {
  const { rates } = selectCurrentRates(args.rateRows, args.productKeys, args.today)
  const out: { productKey: string; listCents: number; billedCents: number }[] = []
  for (const productKey of args.productKeys) {
    const seen = args.observations.get(productKey)
    const current = rates.get(productKey)
    if (!seen?.billed || !seen.list || !current) continue
    if (diffCalendarDays(new Date(seen.list.observed_at), args.today) > 1) continue
    if (seen.list.cost_excl_vat_cents < current.costExclVatCents) {
      out.push({ productKey, listCents: seen.list.cost_excl_vat_cents, billedCents: current.costExclVatCents })
    }
  }
  return out
}

/** Products whose newest observation of any kind is older than the stale window (§3.3 step 5). */
export function staleProducts(args: {
  observations: ReadonlyMap<string, ProductObservations>
  staleAfterDays: number
  today: string
}): { productKey: string; days: number }[] {
  const out: { productKey: string; days: number }[] = []
  for (const [productKey, seen] of args.observations) {
    const newest = [seen.billed, seen.list]
      .filter((o): o is LatestObservation => o !== null)
      .reduce<string>((m, o) => (o.observed_at > m ? o.observed_at : m), "")
    if (!newest) continue
    const days = diffCalendarDays(new Date(newest), args.today)
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
    /** Products whose candidate price is held right now — new or still awaiting an admin. */
    held: number
    /** Holds first raised by THIS run — the ones that alerted. */
    held_new: number
    rejected: number
    unchanged: number
    stale: number
    no_observation: number
    list_below_billed: number
    conflicts: number
    unmapped: number
    rejected_rows: number
    /** Screening lines / PI pulls whose estimated cost was replaced by the billed UnitPrice. */
    reconciled: number
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
  result.summary.rejected_rows = parsed.rejected.length
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

  const rec = await reconcileBilledCosts(db, parsed.observations)
  result.summary.reconciled = rec.lines + rec.pulls
  if (rec.failures.length > 0) {
    result.alerts.push({
      level: "error",
      message: "searchworx-rate-sync: billed cost could not be written back to its line or pull",
      extra: { billing_day: billingDay, failures: rec.failures.length, first: rec.failures[0] },
    })
  }
}

const OBS_COLUMNS = "id, product_key, cost_excl_vat_cents, source, observed_at, vendor_effective_date, raw"

async function newestOf(db: SupabaseClient, productKey: string, sources: readonly ObservationSource[]): Promise<LatestObservation | null> {
  const { data, error } = await db
    .from("searchworx_rate_observations")
    .select(OBS_COLUMNS)
    .eq("product_key", productKey)
    .in("source", [...sources])
    .order("observed_at", { ascending: false })
    .limit(1)
  if (error) throw new Error(`runRateSync: observation read failed for ${productKey} — ${error.message}`)
  return (data?.[0] ?? null) as LatestObservation | null
}

async function readObservations(db: SupabaseClient, productKeys: readonly string[]): Promise<Map<string, ProductObservations>> {
  const pairs = await Promise.all(
    productKeys.map(async (k): Promise<[string, ProductObservations]> => {
      const [billed, list] = await Promise.all([
        newestOf(db, k, ["billing_report", "pull_observed"]),
        newestOf(db, k, ["pricelist_import"]),
      ])
      return [k, { billed, list }]
    }),
  )
  return new Map(pairs.filter(([, o]) => o.billed !== null || o.list !== null))
}

async function readHolds(db: SupabaseClient, productKeys: readonly string[]): Promise<Map<string, HoldStatus>> {
  const { data, error } = await db
    .from("searchworx_rate_holds")
    .select("product_key, held_cents, status")
    .in("product_key", [...productKeys])
  if (error) throw new Error(`runRateSync: searchworx_rate_holds read failed — ${error.message}`)
  return new Map(
    ((data ?? []) as { product_key: string; held_cents: number; status: HoldStatus }[]).map((h) => [holdKey(h.product_key, h.held_cents), h.status]),
  )
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

/** Inserts the hold row; the insert is the alert. A concurrent insert of the same hold (23505) is not a new hold. */
async function raiseHold(db: SupabaseClient, d: Extract<RateDecision, { kind: "hold" }>, thresholdPct: number, result: SyncResult): Promise<void> {
  result.summary.held++
  if (d.existing !== null) return
  const { error } = await db.from("searchworx_rate_holds").insert({
    product_key: d.productKey,
    held_cents: d.observation.cost_excl_vat_cents,
    current_cents: d.fromCents,
    observation_id: d.observation.id,
  })
  if (error?.code === "23505") return
  if (error) throw new Error(`runRateSync: hold insert failed for ${d.productKey} — ${error.message}`)
  result.summary.held_new++
  result.alerts.push({
    level: "error",
    message: `searchworx-rate-sync: ${d.productKey} HELD — observed price moved ${d.pct.toFixed(1)}%, beyond the ${thresholdPct}% guard`,
    extra: {
      product_key: d.productKey,
      old_cents: d.fromCents,
      new_cents: d.observation.cost_excl_vat_cents,
      source: d.observation.source,
      observation_id: d.observation.id,
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
    /** Backfill one past day instead of yesterday (validated by the route). */
    billingDay?: string
    productKeys?: readonly string[]
  },
): Promise<SyncResult> {
  const productKeys = deps.productKeys ?? SYNCED_PRODUCT_KEYS
  const billingDay = deps.billingDay ?? addCalendarDays(deps.today, -1)
  const result: SyncResult = {
    billingDay,
    sourceFailure: null,
    summary: {
      billing_rows: 0, recorded: 0, applied: 0, held: 0, held_new: 0, rejected: 0, unchanged: 0, stale: 0,
      no_observation: 0, list_below_billed: 0, conflicts: 0, unmapped: 0, rejected_rows: 0, reconciled: 0,
    },
    alerts: [],
  }

  await recordBilling(db, await deps.fetchBilling(billingDay), billingDay, result)

  const { data: rateRows, error } = await db
    .from("searchworx_rates")
    .select("product_key, cost_excl_vat_cents, effective_date, source, observation_id")
    .in("product_key", [...productKeys])
  if (error) throw new Error(`runRateSync: searchworx_rates read failed — ${error.message}`)
  const rows = (rateRows ?? []) as LinkedRateRow[]
  const [observations, holds] = await Promise.all([readObservations(db, productKeys), readHolds(db, productKeys)])

  const decisions = decideRateMoves({ productKeys, rateRows: rows, observations, holds, thresholdPct: deps.thresholdPct, today: deps.today })

  // One write per product, independent of each other — concurrent, never a partial batch to reason about.
  await Promise.all(
    decisions.map((d) => {
      if (d.kind === "apply") return applyRate(db, d, result)
      if (d.kind === "hold") return raiseHold(db, d, deps.thresholdPct, result)
      if (d.kind === "unchanged") result.summary.unchanged++
      else if (d.kind === "rejected") result.summary.rejected++
      else result.summary.no_observation++
      return Promise.resolve()
    }),
  )

  const below = listBelowBilled({ productKeys, rateRows: rows, observations, today: deps.today })
  result.summary.list_below_billed = below.length
  for (const b of below) {
    result.alerts.push({
      level: "warning",
      message: `searchworx-rate-sync: ${b.productKey} list price is BELOW the billed rate — one of the two is wrong`,
      extra: { product_key: b.productKey, list_cents: b.listCents, billed_cents: b.billedCents },
    })
  }

  const stale = staleProducts({ observations, staleAfterDays: deps.staleAfterDays, today: deps.today })
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
