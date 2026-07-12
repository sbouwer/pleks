/**
 * scripts/purge-invented-deposit-interest.mjs — remove deposit interest that no bank ever paid
 *
 * WHY THIS EXISTS
 * ---------------
 * `accrueDepositInterest` used to fall back to a HARD-CODED 5% p.a. when it could resolve no rate. In prod it
 * did exactly that: 144 `interest_accrued` postings, R6 452.78, all at 5.000%, on fixture leases in the SAME
 * org as real ones ("Stéan's Properties"). 88 of them were posted AFTER the agency had configured a real 3%
 * rate — the config was scoped to a deposit-holding bank account the leases were not linked to, so it resolved
 * to nothing and the fallback quietly papered over it.
 *
 * That money does not exist. No bank paid it. It is interest at a rate nobody chose, against tenants who do not
 * exist. Left in place it would flow into owner statements, trust reconciliations and deposit reports the first
 * time this org runs one — so it is removed BEFORE launch. This is not a ledger restatement (fixtures never
 * represented real money); it is pre-launch housekeeping, and it is recorded as such.
 *
 * SCOPE (deliberate, enumerated — never a blanket delete):
 *   1. deposit_transactions   WHERE transaction_type = 'interest_accrued'   (the invented interest)
 *   2. trust_transactions     the paired rows the dual-write created for those same postings
 *   3. leases.deposit_interest_last_accrued_date → NULL   (the watermark, so a future accrual at a REAL rate
 *      recomputes from the deposit rather than from where the invented run left off)
 *   4. an audit_log row saying what was removed and why
 *
 * The fixture LEASES themselves are NOT touched — they may be deliberate dev data. Only their invented
 * interest history goes.
 *
 * USAGE:
 *   node scripts/purge-invented-deposit-interest.mjs            # DRY RUN — prints exactly what it would do
 *   node scripts/purge-invented-deposit-interest.mjs --apply    # performs it, inside a transaction
 *
 * Dry-run is the default ON PURPOSE. Read the output before you pass --apply.
 */
import dotenv from "dotenv"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
dotenv.config({ path: resolve(ROOT, ".env.local") })

const PROJECT_REF = process.env.SUPABASE_PROJECT_ID
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error("Missing SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN in .env.local")
  process.exit(1)
}

const APPLY = process.argv.includes("--apply")

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`)
  return body
}

// ── 1. Enumerate, precisely, before touching anything ──────────────────────────────────────────────
const [survey] = await sql(`
  SELECT
    count(*)                                   AS interest_txns,
    count(DISTINCT lease_id)                   AS leases_affected,
    count(DISTINCT org_id)                     AS orgs_affected,
    coalesce(sum(amount_cents), 0)             AS interest_cents,
    count(*) FILTER (WHERE effective_rate_percent = 5.000) AS at_invented_5pct,
    count(*) FILTER (WHERE rate_config_id IS NOT NULL)     AS via_real_config
  FROM deposit_transactions
  WHERE transaction_type = 'interest_accrued';
`)

console.log("\n── deposit interest currently on the ledger ──")
console.table(survey)

// A posting that resolved a REAL config is not invented — it must never be swept up by this.
if (Number(survey.via_real_config) > 0) {
  console.error(
    `\n⛔ ABORT: ${survey.via_real_config} interest posting(s) resolved a real rate_config_id.\n` +
    `   Those are NOT invented interest and this script must not remove them. It is scoped to the\n` +
    `   fallback's output only. Re-scope the query before proceeding.`,
  )
  process.exit(1)
}

const paired = await sql(`
  SELECT count(*) AS trust_rows
  FROM trust_transactions
  WHERE transaction_type = 'deposit_interest'
    AND lease_id IN (SELECT DISTINCT lease_id FROM deposit_transactions WHERE transaction_type = 'interest_accrued');
`)
console.log(`paired trust_transactions (deposit_interest): ${paired[0].trust_rows}`)

if (!APPLY) {
  console.log(
    `\nDRY RUN — nothing was changed.\n` +
    `Would delete ${survey.interest_txns} deposit_transactions + ${paired[0].trust_rows} trust_transactions,\n` +
    `reset the accrual watermark on ${survey.leases_affected} lease(s), and write one audit_log row.\n` +
    `Re-run with --apply to perform it.`,
  )
  process.exit(0)
}

// ── 2. Apply, in ONE transaction ───────────────────────────────────────────────────────────────────
await sql(`
BEGIN;

  CREATE TEMP TABLE _purge_leases ON COMMIT DROP AS
    SELECT DISTINCT lease_id, org_id FROM deposit_transactions WHERE transaction_type = 'interest_accrued';

  DELETE FROM trust_transactions
  WHERE transaction_type = 'deposit_interest'
    AND lease_id IN (SELECT lease_id FROM _purge_leases);

  DELETE FROM deposit_transactions
  WHERE transaction_type = 'interest_accrued';

  -- Reset the watermark: a future accrual at a REAL rate must recompute from the deposit, not resume from
  -- where the invented run stopped.
  UPDATE leases SET deposit_interest_last_accrued_date = NULL
  WHERE id IN (SELECT lease_id FROM _purge_leases);

  -- The record of what was removed and why. Pre-launch housekeeping, not a ledger restatement.
  INSERT INTO audit_log (org_id, table_name, record_id, action, new_values)
  SELECT DISTINCT org_id, 'deposit_transactions', lease_id, 'DELETE',
    jsonb_build_object(
      'event', 'purge_invented_deposit_interest',
      'reason', 'Interest accrued at a hard-coded 5% fallback rate that no bank paid and nobody chose. The agency''s real (3%) config was scoped to a deposit-holding account the leases were not linked to, so it never resolved and the fallback silently posted in its place. The fallback has been removed: accrual now HOLDS when no rate is reachable. Fixture leases never represented real money, so this is pre-launch housekeeping, not a ledger restatement.',
      'purged_at', now()
    )
  FROM _purge_leases;

COMMIT;
`)

const [after] = await sql(`
  SELECT count(*) AS interest_txns_remaining FROM deposit_transactions WHERE transaction_type = 'interest_accrued';
`)
console.log(`\n✓ purged. interest_accrued rows remaining: ${after.interest_txns_remaining}`)
