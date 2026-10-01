/**
 * lib/searchworx/rates/__tests__/sync.test.ts — the daily rate sync (ADDENDUM_14V §3.3, §5)
 *
 * Notes:  §5's cron invariants, probe-first both ways, against an in-memory fake of the two platform tables:
 *         equal → writes nothing; a mismatch under the guard → exactly one rate row linking the observation;
 *         over the guard → no rate row, one observation, one alert. Plus the re-run, quiet-day and
 *         source-failure cases the spec's fail-closed rules (§4) imply.
 */
import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { decideRateMoves, runRateSync, staleProducts, type LatestObservation, type LinkedRateRow } from "@/lib/searchworx/rates/sync"
import type { BillingFetch } from "@/lib/searchworx/billingReport"

type Row = Record<string, unknown>

const TODAY = "2026-10-02"
const CCR = "combined_consumer_credit_report"

function fakeDb(seed: { observations?: Row[]; rates?: Row[] } = {}, rateInsertError: { code: string; message: string } | null = null) {
  const tables: Record<string, Row[]> = {
    searchworx_rate_observations: [...(seed.observations ?? [])],
    searchworx_rates: [...(seed.rates ?? [])],
  }
  let seq = 0
  const get = (r: Row, col: string) => {
    const [c, key] = col.split("->>")
    return key === undefined ? r[c] : (r[c] as Row | null)?.[key]
  }
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let order: { col: string; asc: boolean } | null = null
    let lim: number | null = null
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => (filters.push((r) => get(r, col) === v), q),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(get(r, col))), q),
      order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), q),
      limit: (n: number) => ((lim = n), q),
      then: (resolve: (v: unknown) => unknown) => {
        let out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
        if (order) {
          const { col, asc } = order
          out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
        }
        if (lim !== null) out = out.slice(0, lim)
        return resolve({ data: out, error: null })
      },
      insert: async (rows: Row | Row[]) => {
        if (table === "searchworx_rates" && rateInsertError) return { error: rateInsertError }
        for (const r of Array.isArray(rows) ? rows : [rows]) {
          seq++
          tables[table].push({ id: `new-${seq}`, observed_at: `2026-10-02T03:00:00.${String(seq).padStart(3, "0")}Z`, ...r })
        }
        return { error: null }
      },
    }
    return q
  }
  return { db: { from } as unknown as SupabaseClient, tables }
}

const obsRow = (over: Row = {}): Row => ({
  id: "obs-list",
  product_key: CCR,
  cost_excl_vat_cents: 19410,
  source: "pricelist_import",
  observed_at: "2026-10-01T09:00:00.000Z",
  raw: { vendor_effective_date: "2026-10-01" },
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

function sync(db: SupabaseClient, fetchBilling: () => Promise<BillingFetch> = billed([])) {
  return runRateSync(db, { today: TODAY, fetchBilling, thresholdPct: 25, staleAfterDays: 400, productKeys: [CCR] })
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

  it("PLANTED: a price beyond the guard → NO rate row, one observation, one alert naming old/new/source", async () => {
    const { db, tables } = fakeDb({ observations: [obsRow()], rates: [rateRow()] })
    const r = await sync(db, billed([billingRow("250.00")])) // +28.8%
    expect(tables.searchworx_rates).toHaveLength(1)
    expect(r.summary).toMatchObject({ recorded: 1, applied: 0, held: 1 })
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0]).toMatchObject({ level: "error", extra: { product_key: CCR, old_cents: 19410, new_cents: 25000, source: "billing_report" } })
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
    expect(r.summary.recorded).toBe(0)
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
  const latest = (o: Partial<LatestObservation>) =>
    new Map([[CCR, { ...(obsRow() as unknown as LatestObservation), ...o }]])
  const decide = (rates: Row[], l: Map<string, LatestObservation>) =>
    decideRateMoves({ productKeys: [CCR], rateRows: rates as unknown as LinkedRateRow[], latest: l, thresholdPct: 25, today: TODAY })

  it("exactly at the guard applies; one cent over holds", () => {
    expect(decide([rateRow({ cost_excl_vat_cents: 10000, observation_id: "x" })], latest({ cost_excl_vat_cents: 12500 }))[0].kind).toBe("apply")
    expect(decide([rateRow({ cost_excl_vat_cents: 10000, observation_id: "x" })], latest({ cost_excl_vat_cents: 12501 }))[0].kind).toBe("hold")
    expect(decide([rateRow({ cost_excl_vat_cents: 10000, observation_id: "x" })], latest({ cost_excl_vat_cents: 7499 }))[0].kind).toBe("hold")
  })

  it("an observation with no vendor date is dated today", () => {
    const [d] = decide([], latest({ raw: null }))
    expect(d).toMatchObject({ kind: "apply", effectiveDate: TODAY })
  })

  it("a future-dated rate is not current, but its observation is not applied again", () => {
    const [d] = decide([rateRow({ effective_date: "2026-11-01" })], latest({}))
    expect(d).toMatchObject({ kind: "unchanged", reason: "already_applied" })
  })
})

describe("staleProducts", () => {
  it("flags a product past the window and not one inside it", () => {
    const l = new Map<string, LatestObservation>([
      ["a", { ...(obsRow({ product_key: "a", observed_at: "2025-08-27T08:00:00.000Z" }) as unknown as LatestObservation) }],
      ["b", { ...(obsRow({ product_key: "b", observed_at: "2025-08-28T08:00:00.000Z" }) as unknown as LatestObservation) }],
    ])
    expect(staleProducts({ latest: l, staleAfterDays: 400, today: TODAY })).toEqual([{ productKey: "a", days: 401 }])
  })
})
