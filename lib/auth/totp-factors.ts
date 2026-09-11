/**
 * lib/auth/totp-factors.ts — which TOTP factors are stale enrolment residue?
 *
 * Auth:   none — a pure function over an already-fetched factor list
 * Data:   the shape returned by supabase.auth.mfa.listFactors()
 * Notes:  Exists because reading `listFactors().totp` for unverified factors returns nothing, ever,
 *         and the call site that did so looked correct.
 *
 * ⚠ `listFactors()` GROUPS BY TYPE ONLY AFTER FILTERING TO VERIFIED — read the grouping before
 * trusting a per-type array. `_listFactors` pushes every factor into `all`, then pushes into
 * `data[factor.factor_type]` **inside an `if (factor.status === 'verified')`**. So `.totp` is
 * verified-only by construction, and `factors.totp.filter(f => f.status !== "verified")` is
 * necessarily empty — a filter that reads like a careful check and can never match.
 *
 * That spelling sat in `EnrolTotp`'s mount effect under the comment "Clear any leftover unverified
 * TOTP factors from previous incomplete attempts", so the cleanup never cleared one. The residue it
 * was meant to remove is exactly what makes `mfa.enroll` return 422 "already exists" on a repeated
 * friendly name, which is why `enrollTotp` carries an unenrol-and-retry dance for a condition its
 * own cleanup was supposed to have removed. Two mechanisms for one problem, one of them inert.
 *
 * `all` is the only array that answers a question about UNVERIFIED factors.
 */

/** The subset of `listFactors()` output this needs — structurally typed so the caller can pass the
 *  whole response without this module importing Supabase's types. */
export interface FactorListish {
  all?: Array<{ id: string; factor_type: string; status: string }> | null
}

/**
 * Unverified TOTP factors — abandoned enrolments that hold their friendly name and nothing else.
 *
 * Deliberately NOT filtered by friendly name. The 422 collision is per-name, so a name-scoped sweep
 * would clear the one blocking THIS attempt and leave every other abandoned factor behind, which is
 * how the residue accumulates in the first place. A factor that is unverified is unusable by
 * definition — `mfa.verify` against one completes an enrolment rather than proving possession — so
 * there is nothing to preserve.
 */
export function staleUnverifiedTotpFactors(
  factors: FactorListish | null | undefined,
): Array<{ id: string; factor_type: string; status: string }> {
  return (factors?.all ?? []).filter(f => f.factor_type === "totp" && f.status !== "verified")
}
