/**
 * scripts/check-retention-skiplist.mts — make RETENTION_PROTECTED_TABLES govern the purge (M-082)
 *
 * Auth:   none — static analysis of a migration file plus a TypeScript import
 * Data:   lib/subscriptions/retention.ts (the array) and supabase/migrations/010_platform_features.sql
 *         (purge_org_cascade, which carries the same list TWICE)
 * Notes:  M-082's sketch said the fix was "every purge and erasure path deriving its skip-list from
 *         this array by import". **That is not buildable as written**, and saying so is the finding:
 *         `purge_org_cascade` is a SQL SECURITY DEFINER function and cannot import a TypeScript
 *         array. Ruled 2026-08-23 — the array stays the SSOT and becomes real by being CHECKED
 *         against the SQL rather than imported by it.
 *
 *         ⚠ THE LIST EXISTS THREE TIMES, and until this check shipped nothing compared any pair:
 *           1. `RETENTION_PROTECTED_TABLES` in TypeScript — read by nobody (that was M-082);
 *           2. the six `UPDATE <t> SET org_id = v_sentinel` statements in the function's Step 1;
 *           3. the `NOT IN (…)` exclusion list in Step 2, which stops the delete loop touching them.
 *
 *         **Copies 2 and 3 must agree with each other or the purge is silently wrong in one of two
 *         directions**, and neither direction raises an error. A table in the UPDATE block but
 *         missing from the NOT IN list is repointed to the sentinel and then DELETED — statutory
 *         records destroyed by a purge that reports success. A table in the NOT IN list but missing
 *         from the UPDATE block is neither repointed nor deleted, so it keeps the purged org's id
 *         and survives as un-anonymised data belonging to an org that no longer exists.
 *
 *         The failure is invisible either way: the evidence is the ABSENCE of rows, which is the
 *         same shape as the 2026-08-19 cross-org READ hole (CLAUDE.md §6).
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { RETENTION_PROTECTED_TABLES } from "../lib/subscriptions/retention"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const MIGRATION = "supabase/migrations/010_platform_features.sql"

/** The two tables Step 2 excludes for a DIFFERENT reason — they are handled by Steps 4 and 5. */
const HANDLED_SEPARATELY = ["organisations", "subscriptions"]

export type Extracted = { repointed: string[]; excluded: string[] }

/**
 * Pull `purge_org_cascade`'s body out of a migration's full text.
 *
 * Returns null when the function is not found, and callers MUST treat that as a failure rather than
 * an empty pass — a renamed function that silently matches nothing is a broken query reporting a
 * clean bill of health, the collapsed-analysis shape this repo keeps re-finding in its own gates.
 */
export function extractFunctionBody(sql: string): string | null {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION purge_org_cascade")
  if (start === -1) return null
  const end = sql.indexOf("$$;", start)
  return end === -1 ? null : sql.slice(start, end)
}

/**
 * Both SQL copies of the list.
 *
 * `excluded` is read from the lines of the `NOT IN (…)` block UP TO the one carrying the
 * "retention-protected (step 1)" marker comment, rather than by subtracting a hardcoded set. The
 * subtraction would have been a fourth copy of a list — the exact defect this check exists to
 * prevent — so the SQL's own comment is the boundary.
 */
export function extractSqlLists(body: string): Extracted {
  const repointed = [...body.matchAll(/UPDATE\s+(\w+)\s+SET\s+org_id\s*=\s*v_sentinel/g)].map((m) => m[1])

  const notInStart = body.indexOf("NOT IN (")
  const excluded: string[] = []
  if (notInStart !== -1) {
    for (const line of body.slice(notInStart).split("\n")) {
      for (const q of line.matchAll(/'([a-z_]+)'/g)) {
        if (!HANDLED_SEPARATELY.includes(q[1])) excluded.push(q[1])
      }
      if (line.includes("retention-protected (step 1)")) break
    }
  }
  return { repointed, excluded }
}

/** Compare all three copies. Pure, so both directions are testable without the real file. */
export function compare(declared: readonly string[], found: Extracted): string[] {
  const problems: string[] = []
  const set = (xs: readonly string[]) => new Set(xs)
  const missing = (from: Set<string>, of: readonly string[]) => of.filter((t) => !from.has(t))

  if (found.repointed.length === 0) {
    problems.push("found NO `UPDATE <table> SET org_id = v_sentinel` statements — the parse matched nothing, which is a broken parse rather than a clean result")
    return problems
  }
  if (found.excluded.length === 0) {
    problems.push("found NO retention entries in the Step 2 `NOT IN (…)` list — broken parse, not a clean result")
    return problems
  }

  for (const t of missing(set(found.repointed), declared)) {
    problems.push(`${t} is in RETENTION_PROTECTED_TABLES but is NOT repointed to the sentinel in Step 1 — on purge it keeps the purged org's id and survives as un-anonymised data`)
  }
  for (const t of missing(set(found.excluded), declared)) {
    problems.push(`${t} is in RETENTION_PROTECTED_TABLES but is NOT in the Step 2 exclusion list — the delete loop will DESTROY it, statutory records included`)
  }
  for (const t of missing(set(declared), found.repointed)) {
    problems.push(`Step 1 repoints ${t}, which is NOT in RETENTION_PROTECTED_TABLES — either the array is missing a statutory obligation or the SQL protects something it should not`)
  }
  for (const t of missing(set(declared), found.excluded)) {
    problems.push(`Step 2 excludes ${t}, which is NOT in RETENTION_PROTECTED_TABLES — same divergence, other copy`)
  }
  return problems
}

function selftest(): never {
  const ok = ["audit_log", "consent_log"]
  const cases: Array<[string, string[], boolean]> = [
    ["KNOWN-GOOD: all three copies agree", compare(ok, { repointed: [...ok], excluded: [...ok] }), true],
    ["A TABLE MISSING FROM STEP 2 FAILS — the delete loop would destroy statutory records",
      compare(ok, { repointed: [...ok], excluded: ["audit_log"] }), false],
    ["a table missing from Step 1 fails — it would survive un-anonymised under a dead org id",
      compare(ok, { repointed: ["audit_log"], excluded: [...ok] }), false],
    ["SQL protecting a table the array does not declare fails — divergence in either direction",
      compare(ok, { repointed: [...ok, "leases"], excluded: [...ok, "leases"] }), false],
    ["an empty Step 1 parse FAILS rather than passing vacuously",
      compare(ok, { repointed: [], excluded: [...ok] }), false],
    ["an empty Step 2 parse FAILS rather than passing vacuously",
      compare(ok, { repointed: [...ok], excluded: [] }), false],
  ]

  let bad = 0
  for (const [label, problems, wantOk] of cases) {
    const got = problems.length === 0
    const pass = got === wantOk
    if (!pass) bad++
    console.log(`  ${pass ? "✓" : "✗"} ${label}${pass ? "" : ` — expected ok=${wantOk}, got ok=${got}`}`)
  }

  // Parser probes, against text shaped like the real function rather than against the real file —
  // the real-file assertion is the default mode, and a selftest that reads it would pass by tautology.
  const fixture = `CREATE OR REPLACE FUNCTION purge_org_cascade(p_org_id uuid, p_reason text)
AS $$
BEGIN
  UPDATE audit_log    SET org_id = v_sentinel WHERE org_id = p_org_id;
  UPDATE consent_log  SET org_id = v_sentinel WHERE org_id = p_org_id;
  SELECT 1 FROM information_schema.columns c
    WHERE c.table_name NOT IN (
           'audit_log','consent_log',  -- retention-protected (step 1)
           'organisations','subscriptions'
         );
END;
$$;`
  const body = extractFunctionBody(fixture)
  const got = body ? extractSqlLists(body) : null
  if (got && got.repointed.join() === "audit_log,consent_log" && got.excluded.join() === "audit_log,consent_log") {
    console.log("  ✓ the parser reads BOTH copies out of a real-shaped function body")
  } else {
    console.log(`  ✗ parser probe failed — repointed=${got?.repointed} excluded=${got?.excluded}`); bad++
  }
  if (got && !got.excluded.includes("organisations")) {
    console.log("  ✓ KNOWN-GOOD: the two handled-separately tables are not mistaken for retention entries")
  } else { console.log("  ✗ the handled-separately tables leaked into the retention list"); bad++ }
  if (extractFunctionBody("-- a migration with no such function") === null) {
    console.log("  ✓ a MISSING function returns null, so a rename cannot pass as a clean result")
  } else { console.log("  ✗ a missing function did not return null"); bad++ }

  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-retention-skiplist selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

const sql = readFileSync(join(ROOT, MIGRATION), "utf8")
const body = extractFunctionBody(sql)
if (!body) {
  console.error(`✗ retention skip-list: purge_org_cascade not found in ${MIGRATION}.`)
  console.error("   The check did not run, so it is not green — was the function renamed or moved?")
  process.exit(1)
}

const problems = compare(RETENTION_PROTECTED_TABLES, extractSqlLists(body))
if (problems.length) {
  console.error("✗ retention skip-list: RETENTION_PROTECTED_TABLES and purge_org_cascade disagree.")
  for (const p of problems) console.error(`   • ${p}`)
  process.exit(1)
}
console.log(`✅ retention skip-list: ${RETENTION_PROTECTED_TABLES.length} protected tables agree across the array and both SQL copies`)
