/**
 * lib/searchworx/rates/__tests__/sync.test.ts — the daily rate sync (ADDENDUM_14V §3.3, §5)
 *
 * Notes:  §5's cron invariants, probe-first both ways, against fakeRateDb (the platform tables + their
 *         UNIQUE constraints): equal → writes nothing; a mismatch under the guard → exactly one rate row
 *         linking the observation; over the guard → no rate row, one observation, one hold row, one alert.
 *         Plus the rulings of 2026-10-01: a held value alerts ONCE per (product, value); a rejected value is
 *         never applied; billing beats the list for an ever-billed product; a list below billed warns.
 */
import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  decideRateMoves,
  holdKey,
  runRateSync,
  staleProducts,
  type HoldStatus,
  type LatestObservation,
  type LinkedRateRow,
  type ProductObservations,
} from "@/lib/searchworx/rates/sync"
import type { BillingFetch } from "@/lib/searchworx/billingReport"
import { fakeRateDb, type Row } from "./fakeRateDb"

const TODAY = "2026-10-02"
const CCR = "combined_consumer_credit_report"

const obsRow = (over: Row = {}): Row => ({
  id: "obs-list",
  product_key: CCR,
  cost_excl_vat_cents: 19410,
  source: "pricelist_import",
  observed_at: "2026-10-01T09:00:00.000Z",
  vendor_effective_date: "2026-10-01",
  raw: {},
  ...over,
})

const rateRow = (over: Row = {}): Row => ({
  product_key: CCR,
  cost_excl_vat_cents: 19410,
  effective_date: "2026-10-01",
  source: "pricelist_import",
  observation_id: "obs-list",
  ...over,
})

const fakeDb = (seed: { observations?: Row[]; rates?: Row[]; holds?: Row[] } = {}, rateInsertError?: { code: string; message: string }) =>
  fakeRateDb(
    {
      searchworx_rate_observations: seed.observations ?? [],
      searchworx_rates: seed.rates ?? [],
      searchworx_rate_holds: seed.holds ?? [],
    },
    rateInsertError ? { searchworx_rates: rateInsertError } : {},
  )

const billed = (rows: unknown[]): (() => Promise<BillingFetch>) => async () => ({ ok: true, rows })
const billingRow = (unit: string, ref = "line-1") => ({
  BillDate: "2026-10-01 11:00:00.000",
  Reference: ref,
  SearchType: "Combined Consumer Credit Report",
  Description: "8001015009087",
  Quantity: "1",
  UnitPrice: unit,
  Cost: unit,
})

function sync(db: SupabaseClient, fetchBilling: (day: string) => Promise<BillingFetch> = billed([]), billingDay?: string) {
  return runRateSync(db, { today: TODAY, fetchBilling, thresholdPct: 25, staleAfterDays: 400, productKeys: [CCR], billingDay })
}

describe("runRateSync — §5 cron invariants", () => {
  it("KNOWN-GOOD: equal rate and observation → writes nothing", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow({ id: "obs-2" })], rates: [rateRow()] })
    const r = await sync(db)
    expect(r.summary).toMatchObject({ applied: 0, unchanged: 1, held: 0 })
    expect(tables.searchworx_rates).toHaveLength(1)
    expect(r.alerts).toEqual([])
    expect(r.sourceFailure).toBeNull()
  })

  it("a billed price under the guard → exactly one rate row, linked to the observation, dated to the bill", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    const r = await sync(db, billed([billingRow("170.00")])) // 19410 → 17000 = −12.4%
    expect(r.summary).toMatchObject({ recorded: 1, applied: 1, held: 0 })
    const newObs = tables.searchworx_rate_observations.at(-1)!
    expect(tables.searchworx_rates).toHaveLength(2)
    expect(tables.searchworx_rates[1]).toMatchObject({
      product_key: CCR,
      cost_excl_vat_cents: 17000,
      effective_date: "2026-10-01",
      source: "billing_report",
      observation_id: newObs.id,
    })
  })

  it("PLANTED: a price beyond the guard → NO rate row, one observation, one hold row, one alert naming old/new/source", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    const r = await sync(db, billed([billingRow("250.00")])) // +28.8%
    expect(tables.searchworx_rates).toHaveLength(1)
    expect(r.summary).toMatchObject({ recorded: 1, applied: 0, held: 1, held_new: 1 })
    expect(tables.searchworx_rate_holds).toEqual([expect.objectContaining({ product_key: CCR, held_cents: 25000, current_cents: 19410, status: "held" })])
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0]).toMatchObject({ level: "error", extra: { product_key: CCR, old_cents: 19410, new_cents: 25000, source: "billing_report" } })
  })

  it("a held value alerts ONCE: the next run counts it as held but raises nothing and writes no second hold", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    await sync(db, billed([billingRow("250.00")]))
    const again = await sync(db, billed([]), "2026-09-30")
    expect(again.summary).toMatchObject({ held: 1, held_new: 0, applied: 0 })
    expect(again.alerts).toEqual([])
    expect(tables.searchworx_rate_holds).toHaveLength(1)
  })

  it("KNOWN-GOOD: a DIFFERENT held value for the same product is a new hold and alerts", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    await sync(db, billed([billingRow("250.00")]))
    const r = await sync(db, billed([billingRow("260.00", "line-2")]), "2026-09-30")
    expect(r.summary).toMatchObject({ held_new: 1 })
    expect(r.alerts).toHaveLength(1)
    expect(tables.searchworx_rate_holds.map((h) => h.held_cents)).toEqual([25000, 26000])
  })

  it("a REJECTED value is never applied and never re-alerted", async () => {
    const { db, tables } = fakeDb({
      observations: [obsRow(), obsRow({ id: "obs-b", source: "billing_report", cost_excl_vat_cents: 25000, observed_at: "2026-10-01T12:00:00.000Z" })],
      rates: [rateRow()],
      holds: [{ product_key: CCR, held_cents: 25000, status: "rejected" }],
    })
    const r = await sync(db)
    expect(r.summary).toMatchObject({ rejected: 1, held: 0, applied: 0 })
    expect(r.alerts).toEqual([])
    expect(tables.searchworx_rates).toHaveLength(1)
  })

  it("an admin-APPLIED value is applied by the cron when observed", async () => {
    const { db, tables } = fakeDb({
      observations: [obsRow(), obsRow({ id: "obs-b", source: "billing_report", cost_excl_vat_cents: 25000, observed_at: "2026-10-01T12:00:00.000Z" })],
      rates: [rateRow()],
      holds: [{ product_key: CCR, held_cents: 25000, status: "applied" }],
    })
    const r = await sync(db)
    expect(r.summary).toMatchObject({ applied: 1, held: 0 })
    expect(tables.searchworx_rates[1]).toMatchObject({ cost_excl_vat_cents: 25000, observation_id: "obs-b" })
  })

  it("HIERARCHY: a billed product ignores a NEWER list observation", async () => {
    const { db, tables } = fakeDb({
      observations: [
        obsRow({ id: "obs-b", source: "billing_report", cost_excl_vat_cents: 17000, observed_at: "2026-09-01T09:00:00.000Z" }),
        obsRow({ id: "obs-list", cost_excl_vat_cents: 18000, observed_at: "2026-10-01T09:00:00.000Z" }),
      ],
      rates: [rateRow({ cost_excl_vat_cents: 17000, source: "billing_report", effective_date: "2026-09-01", observation_id: "obs-b" })],
    })
    const r = await sync(db)
    expect(r.summary).toMatchObject({ applied: 0, unchanged: 1 })
    expect(tables.searchworx_rates).toHaveLength(1)
  })

  it("KNOWN-GOOD: an UNBILLED product still moves on its list observation", async () => {
    const { db, tables } = fakeDb({
      observations: [obsRow({ id: "obs-new", cost_excl_vat_cents: 20000, observed_at: "2026-10-01T10:00:00.000Z" })],
      rates: [rateRow({ effective_date: "2026-09-01", observation_id: "obs-old" })],
    })
    const r = await sync(db)
    expect(r.summary.applied).toBe(1)
    expect(tables.searchworx_rates[1]).toMatchObject({ cost_excl_vat_cents: 20000, source: "pricelist_import" })
  })

  it("a list price BELOW the billed rate warns on the run after the import — and not once the import is old", async () => {
    const seed = (listObservedAt: string) => ({
      observations: [
        obsRow({ id: "obs-b", source: "billing_report", cost_excl_vat_cents: 17000, observed_at: "2026-09-01T09:00:00.000Z" }),
        obsRow({ id: "obs-list", cost_excl_vat_cents: 16000, observed_at: listObservedAt }),
      ],
      rates: [rateRow({ cost_excl_vat_cents: 17000, source: "billing_report", effective_date: "2026-09-01", observation_id: "obs-b" })],
    })
    const fresh = await sync(fakeDb(seed("2026-10-01T09:00:00.000Z")).db)
    expect(fresh.summary.list_below_billed).toBe(1)
    expect(fresh.alerts).toEqual([expect.objectContaining({ level: "warning", extra: { product_key: CCR, list_cents: 16000, billed_cents: 17000 } })])
    const old = await sync(fakeDb(seed("2026-09-20T09:00:00.000Z")).db)
    expect(old.summary.list_below_billed).toBe(0)
  })

  it("KNOWN-GOOD: a list price ABOVE the billed rate does not warn", async () => {
    const { db } = fakeDb({
      observations: [
        obsRow({ id: "obs-b", source: "billing_report", cost_excl_vat_cents: 17000, observed_at: "2026-09-01T09:00:00.000Z" }),
        obsRow({ id: "obs-list", cost_excl_vat_cents: 19410 }),
      ],
      rates: [rateRow({ cost_excl_vat_cents: 17000, source: "billing_report", effective_date: "2026-09-01", observation_id: "obs-b" })],
    })
    expect((await sync(db)).summary.list_below_billed).toBe(0)
  })

  it("a backfill fetches the given day, not yesterday", async () => {
    const asked: string[] = []
    const { db } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    const r = await sync(db, async (d) => (asked.push(d), { ok: true, rows: [] }), "2026-09-15")
    expect(asked).toEqual(["2026-09-15"])
    expect(r.billingDay).toBe("2026-09-15")
    const y: string[] = []
    await sync(db, async (d) => (y.push(d), { ok: true, rows: [] }))
    expect(y).toEqual(["2026-10-01"])
  })

  it("a re-run of the same day records nothing twice and applies nothing twice", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    await sync(db, billed([billingRow("170.00")]))
    const again = await sync(db, billed([billingRow("170.00")]))
    expect(again.summary).toMatchObject({ recorded: 0, applied: 0, unchanged: 1 })
    expect(tables.searchworx_rate_observations).toHaveLength(2)
    expect(tables.searchworx_rates).toHaveLength(2)
  })

  it("no rate yet → the latest observation becomes the first rate (the first import)", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()] })
    const r = await sync(db)
    expect(r.summary.applied).toBe(1)
    expect(tables.searchworx_rates[0]).toMatchObject({ cost_excl_vat_cents: 19410, effective_date: "2026-10-01", source: "pricelist_import", observation_id: "obs-list" })
  })

  it("a product with no observation at all is reported, not priced", async () => {
    const { db, tables } = fakeDb()
    const r = await sync(db)
    expect(r.summary).toMatchObject({ no_observation: 1, applied: 0 })
    expect(tables.searchworx_rates).toEqual([])
  })

  it("KNOWN-GOOD: a quiet billing day is not a source failure", async () => {
    const { db } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    expect((await sync(db, billed([]))).sourceFailure).toBeNull()
  })

  it("PLANTED: an unreachable billing report is a source failure — and the comparison still runs", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()] })
    const r = await sync(db, async () => ({ ok: false, error: "Searchworx HTTP 503" }))
    expect(r.sourceFailure).toContain("Searchworx HTTP 503")
    expect(tables.searchworx_rates).toHaveLength(1)
  })

  it("PLANTED: an unreadable billing row records NOTHING from billing and is a source failure", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    const r = await sync(db, billed([billingRow("170.00"), billingRow("R170", "line-2")]))
    expect(r.sourceFailure).toContain("unreadable")
    expect(r.summary).toMatchObject({ recorded: 0, rejected_rows: 1 })
    expect(tables.searchworx_rate_observations).toHaveLength(1)
  })

  it("PLANTED (POPIA): no Description value reaches a stored observation", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    await sync(db, billed([billingRow("170.00")]))
    expect(JSON.stringify(tables)).not.toContain("8001015009087")
  })

  it("a UNIQUE date collision is reported as an alert, never thrown", async () => {
    const { db } = fakeDb({ observations: [obsRow()] }, { code: "23505", message: "duplicate key" })
    const r = await sync(db)
    expect(r.summary).toMatchObject({ applied: 0, conflicts: 1 })
    expect(r.alerts[0].level).toBe("error")
  })

  it("any other rate insert error throws", async () => {
    const { db } = fakeDb({ observations: [obsRow()] }, { code: "42501", message: "denied" })
    await expect(sync(db)).rejects.toThrow("rate insert failed")
  })
})

describe("decideRateMoves — pure", () => {
  const seen = (o: Partial<LatestObservation>, kind: keyof ProductObservations = "list") =>
    new Map<string, ProductObservations>([
      [CCR, { billed: null, list: null, [kind]: { ...(obsRow() as unknown as LatestObservation), ...o } }],
    ])
  const decide = (rates: Row[], obs: Map<string, ProductObservations>, holds = new Map<string, HoldStatus>()) =>
    decideRateMoves({ productKeys: [CCR], rateRows: rates as unknown as LinkedRateRow[], observations: obs, holds, thresholdPct: 25, today: TODAY })

  it("exactly at the guard applies; one cent over holds", () => {
    const r = [rateRow({ cost_excl_vat_cents: 10000, observation_id: "x" })]
    expect(decide(r, seen({ cost_excl_vat_cents: 12500 }))[0].kind).toBe("apply")
    expect(decide(r, seen({ cost_excl_vat_cents: 12501 }))[0].kind).toBe("hold")
    expect(decide(r, seen({ cost_excl_vat_cents: 7499 }))[0].kind).toBe("hold")
  })

  it("a hold carries the existing hold status, and a rejected one decides 'rejected'", () => {
    const r = [rateRow({ cost_excl_vat_cents: 10000, observation_id: "x" })]
    const o = seen({ cost_excl_vat_cents: 20000 })
    expect(decide(r, o, new Map([[holdKey(CCR, 20000), "held" as const]]))[0]).toMatchObject({ kind: "hold", existing: "held" })
    expect(decide(r, o, new Map([[holdKey(CCR, 20000), "rejected" as const]]))[0].kind).toBe("rejected")
    expect(decide(r, o, new Map([[holdKey(CCR, 19999), "rejected" as const]]))[0]).toMatchObject({ kind: "hold", existing: null })
  })

  it("a billing observation with no vendor date is dated today", () => {
    const [d] = decide([], seen({ source: "billing_report", vendor_effective_date: null }, "billed"))
    expect(d).toMatchObject({ kind: "apply", effectiveDate: TODAY })
  })

  it("a billing observation is dated to its billed day", () => {
    const [d] = decide([], seen({ source: "billing_report", vendor_effective_date: "2026-09-30" }, "billed"))
    expect(d).toMatchObject({ kind: "apply", effectiveDate: "2026-09-30" })
  })

  // §8 (ruled 2026-10-01): a list applies from the day it was IMPORTED; its printed date is metadata.
  it("a list is dated to its IMPORT day, never backdated to the vendor's printed date", () => {
    const [d] = decide([], seen({ vendor_effective_date: "2026-04-20", observed_at: "2026-10-01T09:00:00.000Z" }))
    expect(d).toMatchObject({ kind: "apply", effectiveDate: "2026-10-01" })
  })

  it("a list's import day is the SA day, not the UTC day", () => {
    // 23:30 UTC on 30 Sep is 01:30 SAST on 1 Oct.
    const [d] = decide([], seen({ vendor_effective_date: "2026-04-20", observed_at: "2026-09-30T23:30:00.000Z" }))
    expect(d).toMatchObject({ kind: "apply", effectiveDate: "2026-10-01" })
  })

  it("a future-dated rate is not current, but its observation is not applied again", () => {
    const [d] = decide([rateRow({ effective_date: "2026-11-01" })], seen({}))
    expect(d).toMatchObject({ kind: "unchanged", reason: "already_applied" })
  })
})

describe("staleProducts", () => {
  it("flags a product past the window and not one inside it", () => {
    const at = (k: string, observed_at: string): [string, ProductObservations] => [
      k,
      { billed: null, list: obsRow({ product_key: k, observed_at }) as unknown as LatestObservation },
    ]
    const o = new Map([at("a", "2025-08-27T08:00:00.000Z"), at("b", "2025-08-28T08:00:00.000Z")])
    expect(staleProducts({ observations: o, staleAfterDays: 400, today: TODAY })).toEqual([{ productKey: "a", days: 401 }])
  })
})

// §3.6 (ruled 2026-10-02): every call sends Reference = our row id; a billed row overwrites that row's estimate.
describe("runRateSync — billing reconcile", () => {
  const LINE = "11111111-2222-4333-8444-555555555555"
  const PULL = "99999999-8888-4777-8666-555555555555"
  const seeded = (extra: Record<string, Row[]>) => {
    const f = fakeDb({ observations: [obsRow({ id: "obs-2" })], rates: [rateRow()] })
    Object.assign(f.tables, extra)
    return f
  }

  it("a billed line takes the billed UnitPrice and the bill day", async () => {
    const { db, tables } = seeded({
      application_screening_lines: [{ id: LINE, product_key: CCR, cost_cents: 19410, rate_effective_date: "2026-10-01" }],
    })
    const r = await sync(db, billed([billingRow("176.40", LINE)]))
    expect(r.summary.reconciled).toBe(1)
    expect(tables.application_screening_lines[0]).toMatchObject({ cost_cents: 17640, rate_effective_date: "2026-10-01" })
  })

  it("a billed PI pull takes the billed cost on the pull and its searchworx vendor_usage row — never the stamp", async () => {
    const { db, tables } = seeded({
      application_screening_lines: [],
      property_intelligence_pulls: [{ id: PULL, product_type: CCR, cost_cents: 19410, cost_excl_vat_cents: 19410 }],
      vendor_usage: [
        { ref_table: "property_intelligence_pulls", ref_id: PULL, vendor: "searchworx", cost_cents: 19410 },
        { ref_table: "property_intelligence_pulls", ref_id: PULL, vendor: "payfast", cost_cents: 880 },
      ],
    })
    const r = await sync(db, billed([billingRow("176.40", PULL)]))
    expect(r.summary.reconciled).toBe(1)
    expect(tables.property_intelligence_pulls[0]).toMatchObject({ cost_cents: 17640, cost_excl_vat_cents: 19410 })
    expect(tables.vendor_usage.map((u) => u.cost_cents)).toEqual([17640, 880])
  })

  it("PLANTED: a non-UUID reference (pre-change calls) and a product mismatch update nothing", async () => {
    const { db, tables } = seeded({
      application_screening_lines: [{ id: LINE, product_key: "vccb_income_estimator", cost_cents: 715 }],
      property_intelligence_pulls: [],
    })
    const r = await sync(db, billed([billingRow("176.40", LINE), billingRow("176.40", "app-1-abcdef12")]))
    expect(r.summary.reconciled).toBe(0)
    expect(tables.application_screening_lines[0].cost_cents).toBe(715)
  })

  it("an unreadable billing day reconciles nothing", async () => {
    const { db, tables } = seeded({
      application_screening_lines: [{ id: LINE, product_key: CCR, cost_cents: 19410 }],
    })
    await sync(db, billed([billingRow("176.40", LINE), { ...billingRow("x", LINE) }]))
    expect(tables.application_screening_lines[0].cost_cents).toBe(19410)
  })
})
