/**
 * lib/searchworx/rates/__tests__/fakeRateDb.ts — in-memory stand-in for the 14V platform tables, for tests
 *
 * Notes:  Supports exactly the chains the rate code uses (select/eq/in/is/lte/order/limit/single/maybeSingle,
 *         insert[.select().single()], update[.eq…][.select()], upsert(rows, { onConflict, ignoreDuplicates? })) and enforces the two UNIQUE constraints that
 *         behaviour depends on — searchworx_rates (product_key, effective_date, source) and
 *         searchworx_rate_holds (product_key, held_cents) — returning 23505 the way PostgREST does.
 *         `raw->>key` filters read a jsonb key. Not a general Supabase fake: an unsupported chain throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type Row = Record<string, unknown>
type PgError = { code: string; message: string }

const UNIQUE: Record<string, string[]> = {
  searchworx_rates: ["product_key", "effective_date", "source"],
  searchworx_rate_holds: ["product_key", "held_cents"],
}

export function fakeRateDb(seed: Record<string, Row[]> = {}, failInsert: Record<string, PgError> = {}) {
  const tables: Record<string, Row[]> = {
    searchworx_rate_observations: [],
    searchworx_rates: [],
    searchworx_rate_holds: [],
    audit_log: [],
  }
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }))
  let seq = 0

  const get = (r: Row, col: string) => {
    const [c, key] = col.split("->>")
    return key === undefined ? r[c] : (r[c] as Row | null)?.[key]
  }

  const from = (table: string) => {
    tables[table] ??= []
    const filters: ((r: Row) => boolean)[] = []
    let order: { col: string; asc: boolean } | null = null
    let lim: number | null = null
    let one: "single" | "maybe" | null = null
    let op: { kind: "select" } | { kind: "insert"; rows: Row[] } | { kind: "update"; patch: Row } | { kind: "upsert"; rows: Row[]; keys: string[]; ignoreDuplicates: boolean } = { kind: "select" }

    const shape = (rows: Row[]) => {
      if (one === "single") return rows[0] ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } }
      if (one === "maybe") return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }

    const run = () => {
      if (op.kind === "insert") {
        if (failInsert[table]) return { data: null, error: failInsert[table] }
        const out: Row[] = []
        for (const r of op.rows) {
          const u = UNIQUE[table]
          if (u && tables[table].some((x) => u.every((c) => x[c] === r[c]))) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } }
          }
          seq++
          const stamp = `2026-10-02T03:00:00.${String(seq).padStart(3, "0")}Z`
          const row: Row = { id: `new-${seq}`, observed_at: stamp, first_held_at: stamp, status: table === "searchworx_rate_holds" ? "held" : undefined, ...r }
          tables[table].push(row)
          out.push(row)
        }
        return shape(out)
      }
      if (op.kind === "upsert") {
        // ON CONFLICT (keys) DO UPDATE — merge into the row the keys match, else insert. ignoreDuplicates = DO NOTHING.
        const { keys, ignoreDuplicates } = op
        const out = op.rows.map((r) => {
          const hit = tables[table].find((x) => keys.every((c) => x[c] === r[c]))
          if (hit) return ignoreDuplicates ? hit : Object.assign(hit, r)
          seq++
          const row: Row = { id: `new-${seq}`, ...r }
          tables[table].push(row)
          return row
        })
        return shape(out)
      }
      let rows = tables[table].filter((r) => filters.every((f) => f(r)))
      if (op.kind === "update") {
        const patch = op.patch
        rows.forEach((r) => Object.assign(r, patch))
        return shape(rows)
      }
      if (order) {
        const { col, asc } = order
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
      }
      if (lim !== null) rows = rows.slice(0, lim)
      return shape(rows)
    }

    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => (filters.push((r) => get(r, col) === v), q),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(get(r, col))), q),
      is: (col: string, v: null) => (filters.push((r) => (get(r, col) ?? null) === v), q),
      // Only the `not(col, "is", null)` form — anything else is not a chain this fake understands.
      not: (col: string, op: string, v: null) => {
        if (op !== "is" || v !== null) throw new Error(`fakeRateDb: unsupported not(${col}, ${op})`)
        return (filters.push((r) => (get(r, col) ?? null) !== null), q)
      },
      lte: (col: string, v: string) => (filters.push((r) => String(get(r, col)) <= v), q),
      order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), q),
      limit: (n: number) => ((lim = n), q),
      single: () => ((one = "single"), q),
      maybeSingle: () => ((one = "maybe"), q),
      insert: (rows: Row | Row[]) => ((op = { kind: "insert", rows: Array.isArray(rows) ? rows : [rows] }), q),
      update: (patch: Row) => ((op = { kind: "update", patch }), q),
      upsert: (rows: Row | Row[], o: { onConflict: string; ignoreDuplicates?: boolean }) =>
        ((op = { kind: "upsert", rows: Array.isArray(rows) ? rows : [rows], keys: o.onConflict.split(",").map((k) => k.trim()), ignoreDuplicates: !!o.ignoreDuplicates }), q),
      then: (resolve: (v: unknown) => unknown) => resolve(run()),
    }
    return q
  }

  return { db: { from } as unknown as SupabaseClient, tables }
}
