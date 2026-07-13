/**
 * test/import/crashClient.ts — a Supabase client that DIES mid-import, exactly as a flaky connection does
 *
 * Notes:  The importer has NO wrapping transaction, and that is deliberate: a 5 000-row book cannot be one
 *         Postgres transaction, and refusing the whole file because row 4 800 failed would be its own disaster.
 *         The price of that decision is that a crash leaves the database HALF-WRITTEN — some properties, units,
 *         tenants and leases committed, the rest not.
 *
 *         Complete-run idempotency is already proven (run the same book twice → identical database). But that
 *         is the easy half. The half an agency actually hits is the flaky connection: the import dies at row N,
 *         they hit "import" again, and the question is whether the second run CONVERGES on the same database a
 *         single clean run would have produced — or whether it doubles, or strands, or half-links.
 *
 *         So: a client that behaves normally for N writes and then throws, like a dropped connection. The
 *         failure is injected at the TRANSPORT, not by mocking the runner — the runner must not be able to tell
 *         it is being tested, or the test proves nothing about the real code path.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/** A query that failed the way supabase-js actually fails: it RESOLVES to `{ data: null, error }`. */
function failedQuery(): unknown {
  const result = { data: null, error: { message: "fetch failed: connection lost", code: "" } }
  return new Proxy({} as object, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      }
      return () => failedQuery()      // .eq / .ilike / .limit / .maybeSingle / .single / .order …
    },
  })
}

export class InjectedCrash extends Error {
  constructor(public readonly afterWrites: number) {
    super(`injected crash: connection lost after ${afterWrites} write(s)`)
    this.name = "InjectedCrash"
  }
}

/**
 * Wrap a real client so writes fail in a chosen window, and then HEAL.
 *
 * `crashAfter(db, 4)` — fail every write from the 5th onward, forever. That is a dead database.
 * `crashAfter(db, 4, 6)` — fail writes 5..10, then work normally again. That is a dropped connection: the thing
 *                          that actually happens, and the only thing an automatic retry can help with.
 *
 * The healing variant is what makes the auto-retry testable at all. Against a permanently dead client the
 * retry can only ever fail, so a test using one would prove that the retry RUNS — never that it WORKS.
 */
export function crashAfter(
  db: SupabaseClient, writes: number, failFor = Number.POSITIVE_INFINITY,
  opts: { failReads?: boolean } = {},
): { client: SupabaseClient; count: () => number } {
  let n = 0
  const failing = () => n > writes && n <= writes + failFor

  const wrapBuilder = (builder: unknown): unknown =>
    new Proxy(builder as object, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)

        // READS. A real dropped connection fails SELECTs too, not only INSERTs — and that is the case that
        // matters most, because every "does this already exist?" guard in the importer is a SELECT. If a failed
        // lookup reads as "not found", the importer creates the row AGAIN.
        //
        // ⚠ AND IT RESOLVES TO AN ERROR — IT DOES NOT THROW. supabase-js never throws on a failed query; even a
        // dropped socket comes back as `{ data: null, error: { message: "fetch failed" } }`. A client that THROWS
        // models something the library never does, and it makes the code look SAFE, because the throw is caught
        // by the row's try/catch and the row is refused: fail-closed BY ACCIDENT. The genuine fail-open needs the
        // error OBJECT — `if (error) log(error)` → data is null → "does not exist" → INSERT.
        //
        // The first version of this client passed reads through untouched entirely ("reads keep working right up
        // to the moment of death"), which made the whole convergence proof a proof about WRITE-ONLY failure. The
        // second version failed them by THROWING, which proved almost as little. Two walks to get one client to
        // fail the way the database actually fails.
        if (opts.failReads && prop === "select") {
          return (...args: unknown[]) => {
            n++
            if (failing()) return failedQuery()
            return wrapBuilder((value as (...a: unknown[]) => unknown).apply(target, args))
          }
        }

        // The write verbs.
        if (prop === "insert" || prop === "upsert" || prop === "update" || prop === "delete") {
          return (...args: unknown[]) => {
            n++
            if (failing()) throw new InjectedCrash(writes)
            return wrapBuilder((value as (...a: unknown[]) => unknown).apply(target, args))
          }
        }

        if (typeof value === "function") {
          return (...args: unknown[]) => {
            const out = (value as (...a: unknown[]) => unknown).apply(target, args)
            // Query builders are thenable AND chainable — keep wrapping so a later .insert() is still counted.
            return out && typeof out === "object" && !(out instanceof Promise) ? wrapBuilder(out) : out
          }
        }
        return value
      },
    })

  const client = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => wrapBuilder(target.from(table))
      }
      if (prop === "rpc") {
        return (...args: unknown[]) => {
          n++
          if (failing()) throw new InjectedCrash(writes)
          return (target.rpc as unknown as (...a: unknown[]) => unknown)(...args)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as SupabaseClient

  return { client, count: () => n }
}


/**
 * A client whose SELECTs fail on NAMED TABLES ONLY — everything else works perfectly.
 *
 * The counter-based client cannot reach every guard: the landlord phase runs LAST, so by the time the crash
 * window opens and closes the landlord lookup has long since happened on a healthy connection. A test built on
 * it therefore passes while the landlord dedup guard is wide open — which is exactly what happened, and exactly
 * the shape of the bug it was written to catch, recurring one level in.
 *
 * "The probe must fire" is not a slogan. If a failure cannot be STEERED at the code path under test, the test
 * is measuring its own reach, not the code's correctness.
 */
export function failReadsOn(db: SupabaseClient, tables: string[]): SupabaseClient {
  const targeted = new Set(tables)

  // ⚠ IT RESOLVES TO AN ERROR. IT DOES NOT THROW. This is the whole point, and my first attempt got it wrong.
  //
  // supabase-js does NOT throw when a query fails — it RESOLVES to `{ data: null, error }`. Even a dropped
  // socket comes back as `{ data: null, error: { message: "fetch failed" } }`. A client that THROWS therefore
  // models something the real library never does, and worse, it makes the code look SAFE: the throw is caught
  // by the row's try/catch and the row is refused. Fail-closed by accident.
  //
  // The genuine fail-open needs the error OBJECT: `if (error) log(error)` → `data` is null → "does not exist" →
  // INSERT. That is the shape the walk described, and no probe in this harness could produce it. So the probe
  // that "fired" proved nothing, and the one before it proved nothing either. Two green tests over a wide-open
  // duplication path — because the failure they injected was not the failure that happens.
  const wrapBuilder = (builder: unknown, table: string): unknown =>
    new Proxy(builder as object, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)
        if (prop === "select" && targeted.has(table)) return () => failedQuery()

        if (typeof value === "function") {
          return (...args: unknown[]) => {
            const out = (value as (...a: unknown[]) => unknown).apply(target, args)
            return out && typeof out === "object" && !(out instanceof Promise) ? wrapBuilder(out, table) : out
          }
        }
        return value
      },
    })

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "from") return (table: string) => wrapBuilder(target.from(table), table)
      return Reflect.get(target, prop, receiver)
    },
  }) as SupabaseClient
}
