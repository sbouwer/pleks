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

export class InjectedCrash extends Error {
  constructor(public readonly afterWrites: number) {
    super(`injected crash: connection lost after ${afterWrites} write(s)`)
    this.name = "InjectedCrash"
  }
}

/** Wrap a real client so the Nth write (insert/upsert/update/rpc) throws instead of reaching Postgres. */
export function crashAfter(db: SupabaseClient, writes: number): { client: SupabaseClient; count: () => number } {
  let n = 0

  const wrapBuilder = (builder: unknown): unknown =>
    new Proxy(builder as object, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver)

        // The write verbs. Everything else (select, eq, order, …) passes through untouched, so reads keep
        // working right up to the moment of death — which is what a dropped connection actually looks like.
        if (prop === "insert" || prop === "upsert" || prop === "update" || prop === "delete") {
          return (...args: unknown[]) => {
            n++
            if (n > writes) throw new InjectedCrash(writes)
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
          if (n > writes) throw new InjectedCrash(writes)
          return (target.rpc as unknown as (...a: unknown[]) => unknown)(...args)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as SupabaseClient

  return { client, count: () => n }
}
