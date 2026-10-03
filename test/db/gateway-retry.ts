/**
 * test/db/gateway-retry.ts — a fetch for the DB tier's test client that retries only the gateway's own transient answers
 *
 * Auth:   none — wraps whatever fetch the service-role test client would have used
 * Data:   none
 * Notes:  PR #337's first CI attempt died on `seed organisations: An invalid response was received from the
 *         upstream server` — Kong's 502 when PostgREST drops the connection behind it. The file it failed in
 *         runs no DDL, so it was not a schema-cache reload; it was the local stack's plumbing, not the code
 *         under test, and the only remedy was re-running the whole job.
 *         The retry is deliberately NARROW: 502/503/504 only, which are answers from the gateway or from
 *         PostgREST before it reached Postgres. A Postgres error — a constraint, an RLS denial, a trigger
 *         refusal — arrives as 4xx/500 and is NEVER retried, so a real defect still fails on the first try.
 *         Every retry is logged, so a flake stays visible in the job output instead of being absorbed.
 *         A 502 does not prove the request never ran. Seeds use fixed ids, so a retried insert that had in
 *         fact landed fails loudly as a duplicate key — a visible failure, not a silent second row.
 *         Test-tier only. Production code has no business retrying a write on a gateway error.
 */

export const GATEWAY_TRANSIENT = new Set([502, 503, 504])

/** Delays before each retry. Two retries, ~1.25 s worst case — long enough for PostgREST to come back. */
export const RETRY_DELAYS_MS = [250, 1000]

type Fetch = typeof fetch

function pathOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === "string") return new URL(input).pathname
  if (input instanceof URL) return input.pathname
  return new URL(input.url).pathname
}

export function gatewayRetryFetch(
  inner: Fetch = fetch,
  delays: readonly number[] = RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (msg: string) => void = (msg) => console.warn(msg),
): Fetch {
  return async (input, init) => {
    let res = await inner(input, init)
    for (const delay of delays) {
      if (!GATEWAY_TRANSIENT.has(res.status)) return res
      log(`[db-tier] gateway ${res.status} on ${init?.method ?? "GET"} ${pathOf(input)} — retrying in ${delay}ms`)
      // Sequential by design: each retry waits on the one before it.
      await sleep(delay)
      res = await inner(input, init)
    }
    return res
  }
}
