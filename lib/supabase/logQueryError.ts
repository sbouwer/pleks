/**
 * lib/supabase/logQueryError.ts — central sink for otherwise-swallowed Supabase query errors
 *
 * Notes:  Companion to the `pleks/require-supabase-error-check` ESLint rule and the
 *         scripts/codemod-supabase-error.mjs codemod. Deliberately a single function CALL
 *         (not an `if` branch) so adding it to a query site never trips
 *         sonarjs/cognitive-complexity — the failure mode hit when guarding query-heavy
 *         functions inline. Behaviour-preserving: it only logs (no throw, no redirect), so
 *         the existing `data ?? []` recovery still runs exactly as before — the only change
 *         is that a failed query is now LOUD instead of silent. Single place to later also
 *         route to Sentry (one line) if we want these tracked, not just logged.
 */

/** Shape of a Supabase/PostgREST error (only what we log). Null/undefined = success → no-op. */
type SupabaseQueryError = { message: string; code?: string } | null | undefined

/**
 * Log a Supabase query error when present.
 * @param context short location label, e.g. "fetchLeases leases" or "createUnit units"
 * @param error   the `error` from `const { data, error } = await supabase.from(...)...`
 */
export function logQueryError(context: string, error: SupabaseQueryError): void {
  if (!error) return
  console.error(`[${context}] supabase query failed:`, error.message)
}
