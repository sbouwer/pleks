/**
 * scripts/security/open-policy.mjs — Category 7's verdict on a USING (true) policy, shared by the audit and its DB probe
 *
 * Notes:  Lifted out of audit.mjs (ADDENDUM_14V step 7) so the planted-policy probe in
 *         test/db/searchworx-rates-rls.dbtest.ts judges a policy with the SAME function security:db does,
 *         instead of a copy that could agree with it by coincidence.
 *
 *         NEVER_PUBLIC_TABLES exists because of #324: 14V §3.1 gave searchworx_rates a SELECT-for-authenticated
 *         USING (true) "mirroring prime_rates", and every logged-in user — tenants included — could read
 *         Pleks's supplier cost. Cat 7 caught it. The way to un-catch it is one line in the allowlist below, so
 *         the allowlist refuses those tables at load: an audit that imports this module cannot run with them in it.
 */

// Tables that intentionally have USING (true) for SELECT — read-only reference/seed data.
// NOTE: allowlisting only suppresses the finding for a SELECT-only USING(true) policy
// (see the `pol.cmd === "SELECT"` guard below) — a future FOR ALL / write USING(true)
// on any of these STILL fails. Each entry below was verified: RLS enabled, writes locked
// (no public write policy), content-only / no PII. Re-verify before adding any new table.
export const READ_ONLY_PUBLIC_TABLES = new Set([
  "lease_clause_library",     // Shared clause seed data — no org_id
  "prime_rates",              // SARB prime rate history — public reference
  "rule_templates",           // Shared property rule templates — no org_id
  "external_links",           // Public link registry (footer/health-checked) — SELECT-only, writes RLS-blocked
  "site_content",             // Public marketing/site copy — SELECT-only, writes RLS-blocked
  "privacy_policy_versions",  // Published privacy-policy text (meant to be public) — SELECT-only; writes gated to platform_admin
])

// Platform tables whose rows ARE Pleks's margin: supplier cost per product. Never readable by a user, whatever
// a precedent's shape suggests (CF-15: "ask what the row IS before copying its policy").
export const NEVER_PUBLIC_TABLES = new Set([
  "searchworx_rates",
  "searchworx_rate_observations",
  "searchworx_rate_holds",
])

for (const t of NEVER_PUBLIC_TABLES) {
  if (READ_ONLY_PUBLIC_TABLES.has(t)) {
    throw new Error(`open-policy: ${t} is supplier cost and may never be allowlisted as read-only public (ADDENDUM_14V §3.1, #324)`)
  }
}

/**
 * Cat 7's verdict on one get_rls_audit() row: null when its qual is not `true`; "allowed" for a SELECT-only
 * USING (true) on an allowlisted table; "open" — a CRITICAL finding — for every other USING (true).
 */
export function openPolicyVerdict(table, pol) {
  if (!pol.qual || pol.qual.trim() !== "true") return null
  return READ_ONLY_PUBLIC_TABLES.has(table) && pol.cmd === "SELECT" ? "allowed" : "open"
}
