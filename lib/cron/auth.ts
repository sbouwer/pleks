/**
 * lib/cron/auth.ts — the single cron-secret gate
 *
 * Auth:   x-cron-secret header (cPanel standard) or Authorization: Bearer — constant-time compared.
 * Notes:  Every cron route is an independently HTTP-reachable production endpoint whose ONLY gate is this
 *         check. The daily orchestrator calls its children IN-PROCESS (it imports their GET and passes a
 *         NextRequest carrying the header), but Next still exposes each child at its own URL — so a child
 *         is exactly as exposed as the orchestrator, and needs its own gate. 32 routes each re-typed
 *         `secret !== optionalEnv("CRON_SECRET")`, a non-constant-time compare leaking the secret's length
 *         and matching prefix through response timing. This module is the one place that compare exists;
 *         withCronRun delegates here too.
 *
 *         NEVER accept the secret via a ?secret= query param — secrets in URLs leak into access logs,
 *         proxy logs, and browser history. Three routes (invoice-generate, lease-expiry-check,
 *         owner-statement-gen) did exactly that until this landed; no caller used it.
 *
 *         Fails CLOSED: an unset CRON_SECRET denies every request rather than admitting all of them.
 *
 *         Enforced by `pleks/no-raw-cron-secret` (ESLint): reading optionalEnv("CRON_SECRET") outside
 *         lib/cron/ is an error. A centre without a lint rule is a suggestion, not an invariant.
 */
import { timingSafeEqual } from "node:crypto"
import { optionalEnv } from "@/lib/env"

/** Constant-time secret compare (avoids leaking length/prefix via response timing). */
export function secretMatches(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false
  try {
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** True when the request carries the correct cron secret. Fails closed when CRON_SECRET is unset. */
export function isCronAuthorised(req: Request): boolean {
  const expected = optionalEnv("CRON_SECRET")
  if (!expected) return false
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "")
  return secretMatches(provided, expected)
}

/**
 * Gate a cron route. Returns a 401 Response to return immediately, or null when authorised.
 *
 *   export async function GET(req: NextRequest) {
 *     const denied = requireCronAuth(req)
 *     if (denied) return denied
 *     …
 *   }
 *
 * Returning the Response (rather than throwing) keeps the call sites' control flow identical to the
 * inline checks it replaces, so the migration is provably behaviour-preserving.
 */
export function requireCronAuth(req: Request): Response | null {
  if (isCronAuthorised(req)) return null
  return Response.json({ error: "Unauthorized" }, { status: 401 })
}

/**
 * Headers the daily orchestrator attaches when invoking a child cron in-process.
 *
 * Exists so `optionalEnv("CRON_SECRET")` is read NOWHERE outside this module — which lets
 * `pleks/no-raw-cron-secret` be an absolute rule with no allowlist. An allowlisted exception is where the
 * next raw read hides.
 */
export function internalCronHeaders(): Headers {
  const secret = optionalEnv("CRON_SECRET")
  if (!secret) throw new Error("CRON_SECRET is not configured — the orchestrator cannot authorise its children")
  return new Headers({ "x-cron-secret": secret })
}
