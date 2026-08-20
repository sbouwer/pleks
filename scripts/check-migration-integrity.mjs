#!/usr/bin/env node
/**
 * scripts/check-migration-integrity.mjs — M-006 · M-020 · M-005, shipped as one script.
 *
 * The register notes M-006 and M-020 "could ship as one combined migration-integrity script";
 * M-005 parses the same files for the same reason, so all three live here. Three assertions over
 * `supabase/migrations/*.sql`:
 *
 *   1. M-006 — the file SET is exactly the twelve named files. `check-migration-forward-refs.mjs`
 *      validates reference ORDER *within* the existing twelve; a thirteenth file passes every
 *      gate in the repo today, while "amend-forward, never add a file" is doctrine.
 *
 *   2. M-020 — every `CREATE POLICY` is preceded, in the same file, by a matching
 *      `DROP POLICY IF EXISTS` for the same policy on the same table. Without the drop the
 *      migration ABORTS partway and silently leaves everything below it unapplied — the failure
 *      is not a bad policy, it is a half-applied migration.
 *
 *   3. M-005 — every `CREATE TABLE` carries `org_id`, unless the table is in the identity-scoped
 *      allowlist (a row describing a HUMAN, read before an org is selected) or in the baseline.
 *
 * ── ON THE REGEXES, WHICH HAVE A HISTORY ──────────────────────────────────────────────────────
 * A previous attempt at the policy-pairing scan reported 328 unpaired policies, then 29, then 21,
 * misclassifying a known-good file every time; the cause was `\s` degrading to a literal `s`
 * inside a JS template literal. So: every pattern here is a LITERAL regex, never built from a
 * string, and `--selftest` proves each fires on a planted violation AND stays quiet on a
 * known-good case seeded FROM A REAL MIGRATION rather than authored from imagination — an
 * authored fixture confirmed a broken check twice in one day (LESSONS L-01, and the paren
 * truncation in eslint-cache-guard).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const MIG = "supabase/migrations"
const RULE = ".claude/rules/identity-scoped-tables.md"
const BASELINE = "scripts/migration-integrity.baseline.json"

/** The twelve. Doctrine is that this list does not grow — amend forward into these. */
export const EXPECTED_FILES = [
  "001_foundation.sql", "002_contacts.sql", "003_properties.sql", "004_leases_financials.sql",
  "005_operations.sql", "006_seed.sql", "007_enhancements.sql", "008_enhancements2.sql",
  "009_security.sql", "010_platform_features.sql", "011_documents_messaging.sql",
  "012_property_extensions.sql",
]

/** Strip SQL comments so prose in a migration cannot be mistaken for DDL. */
export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

const POLICY_NAME = /("(?:[^"]|"")*"|[A-Za-z_][\w$]*)/.source

/** Balanced extraction of a CREATE TABLE body — the naive "up to the next )" is wrong. */
export function createTables(sql) {
  const out = []
  // `CREATE TABLE x AS SELECT …` has no parenthesised body, so the paren-walk below never sees it
  // and M-005's claim ("every CREATE TABLE carries org_id") silently excluded the form entirely.
  // Captured to the statement terminator instead; if org_id is not in the projection it fails like
  // any other table.
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s+AS\b/gi)) {
    const end = sql.indexOf(";", m.index)
    out.push({
      table: m[1].replace(/"/g, "").split(".").pop(),
      body: sql.slice(m.index, end === -1 ? sql.length : end),
    })
  }
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(/gi)) {
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < sql.length; i++) {
      if (sql[i] === "(") depth++
      else if (sql[i] === ")" && --depth === 0) break
    }
    out.push({ table: m[1].replace(/"/g, "").split(".").pop(), body: sql.slice(m.index, i) })
  }
  return out
}

export function policyFindings(sql, file) {
  const out = []
  const dropped = new Set()
  // `public.` is the default schema, so `DROP POLICY … ON public.leases` and `CREATE POLICY … ON
  // leases` name the SAME table and must pair. They did not, and the failure direction is a false
  // POSITIVE — noise, which is the direction that gets a check an allowlist. Only `public.` is
  // stripped: `storage.objects` is genuinely a different table from any bare `objects`.
  const norm = (n, t) =>
    `${n.replace(/"/g, "").toLowerCase()}@${t.replace(/"/g, "").toLowerCase().replace(/^public\./, "")}`

  // Single ordered pass: a DROP only covers a CREATE that comes AFTER it.
  const events = []
  for (const m of sql.matchAll(new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${POLICY_NAME}\\s+ON\\s+([\\w."]+)`, "gi")))
    events.push({ at: m.index, kind: "drop", key: norm(m[1], m[2]) })

  // THIRD pattern: a dynamic drop loop, e.g.
  //   EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.name)
  // inside a FOR-loop over pg_policies. It drops EVERY policy on that table, so any CREATE on the
  // same table below it is protected — by a DROP whose name is `%I`, which no literal-name match
  // can ever pair. Recorded as a wildcard drop for the table.
  for (const m of sql.matchAll(/DROP\s+POLICY\s+IF\s+EXISTS\s+%I\s+ON\s+([\w."]+)/gi))
    events.push({ at: m.index, kind: "drop", key: norm("*", m[1]) })
  for (const m of sql.matchAll(new RegExp(`CREATE\\s+POLICY\\s+${POLICY_NAME}\\s+ON\\s+([\\w."]+)`, "gi")))
    events.push({ at: m.index, kind: "create", key: norm(m[1], m[2]), name: m[1], table: m[2] })

  events.sort((a, b) => a.at - b.at)
  for (const e of events) {
    if (e.kind === "drop") dropped.add(e.key)
    else if (!dropped.has(e.key) && !dropped.has(norm("*", e.table)) && !hasExistenceGuard(sql, e.name, e.table, e.at) && !hasDuplicateObjectGuard(sql, e.at))
      out.push(`${file}: CREATE POLICY ${e.name} ON ${e.table} has no preceding DROP POLICY IF EXISTS — this migration ABORTS on re-run and leaves everything below it unapplied`)
  }
  return out
}

/**
 * The SECOND idempotency pattern, and the reason this check was not simply baselined.
 *
 * A first run flagged 27 policies. Classifying them per site rather than sweeping them into a
 * baseline showed 17 were wrapped in
 *
 *   IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='t' AND policyname='p') THEN
 *     CREATE POLICY "p" ON t ...
 *
 * which is equally idempotent and needs no DROP — it creates only when absent. Baselining those
 * would have buried a legitimate pattern as if it were debt, and left the check with a 63%
 * false-positive rate, which is how a check earns an allowlist and then stops meaning anything.
 *
 * The guard must name the specific policy: a bare `IF NOT EXISTS` elsewhere in the file proves
 * nothing about THIS policy.
 */
/**
 * The FOURTH idempotency pattern, found by reading the SQL rather than trusting the check:
 *
 *   DO $$ BEGIN
 *     CREATE POLICY "p" ON t ...;
 *   EXCEPTION WHEN duplicate_object THEN NULL;
 *   END $$;
 *
 * Postgres raises `42710 duplicate_object` when the policy exists; the handler swallows it. Fully
 * idempotent, and it needs no DROP at all.
 *
 * This one matters for the count: it was the reason 2 of the "6 real defects" were not defects.
 * Four separate legitimate patterns exist in this codebase, and every one of them was found by
 * opening the file a finding pointed at. A check's first number is a hypothesis.
 */
export function hasDuplicateObjectGuard(sql, createIndex) {
  // The ENCLOSING block, not "the next END $$ anywhere below". The first version sliced from the
  // CREATE to the next END $$ in the FILE, so a CREATE sitting above an unrelated DO block
  // inherited that block's handler — reproduced by adversarial review against 007, where an
  // unguarded `CREATE POLICY "walker_probe" ON leases` planted above a real DO block reported
  // clean, and the same statement at EOF correctly fired. Position-dependent blindness in the one
  // file whose pattern motivated the feature.
  const end = sql.indexOf("END $$", createIndex)
  if (end === -1) return false
  const open = sql.lastIndexOf("DO $$", createIndex)
  if (open === -1) return false
  // A DO block already closed before the CREATE does not enclose it.
  const closedBefore = sql.lastIndexOf("END $$", createIndex)
  if (closedBefore > open) return false
  return /EXCEPTION\s+WHEN\s+duplicate_object/i.test(sql.slice(open, end))
}

export function hasExistenceGuard(sql, policyName, table, createIndex) {
  // Must name BOTH the policy and its table. Matching on policyname alone meant a guard for a
  // same-named policy on a DIFFERENT table protected an unguarded CREATE — reproduced against
  // 007, where planting `CREATE POLICY "org members can upload org assets" ON some_other_table`
  // reported clean because 007 guards that name on storage.objects. Policy names ARE reused
  // across tables here (org_isolation, landlord_portal_*), so this was the likely case, not a
  // contrived one. Every real guard in the tree names both, so requiring it costs nothing.
  // …and it must ENCLOSE this CREATE. The name+table match was file-global on POSITION, so a bare
  // duplicate `CREATE POLICY "p" ON t` anywhere in the file — including at EOF, below every guard —
  // was protected by the guard written for the REAL, guarded CREATE of the same policy. Reproduced
  // against 005: appending an unguarded duplicate of `screening_reports_org_read` left the file
  // reporting 0 findings. Same position-blindness `hasDuplicateObjectGuard` was fixed for one pass
  // earlier, in the sibling function twenty lines up — fixed there, missed here.
  const esc = (s) => s.replace(/"/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const bareTable = esc(String(table).split(".").pop())
  const nameRe = new RegExp(`policyname\\s*=\\s*'?${esc(policyName)}`, "i")
  const tableRe = new RegExp(`tablename\\s*=\\s*'?${bareTable}\\b`, "i")

  for (const m of sql.matchAll(/IF\s+NOT\s+EXISTS[\s\S]{0,400}?THEN/gi)) {
    if (!nameRe.test(m[0]) || !tableRe.test(m[0])) continue
    // A guard with no caller index is trusted as before — the exported function is used directly by
    // probes. Production callers pass the index and get the positional test.
    if (createIndex === undefined) return true
    const thenEnd = m.index + m[0].length
    const rest = sql.slice(thenEnd).search(/\bEND\s+IF\b/i)
    // No closing END IF: the guard's extent cannot be established, so it protects nothing. Fails
    // toward reporting, which is noisy rather than silent.
    if (rest === -1) continue
    if (createIndex > thenEnd && createIndex < thenEnd + rest) return true
  }
  return false
}

/**
 * Read the allowlist from the rule file rather than mirroring it into code — a mirror needs a
 * parity test to stay honest, and the doc is already tracked. Fails LOUDLY if the section is
 * missing: an empty allowlist that silently exempted nothing would be noisy (safe), but a parse
 * that accidentally matched everything would exempt everything (silent), so bound both ends.
 */
export function identityScopedTables(text) {
  const sec = /###\s*Current members[^\n]*\n([\s\S]*?)(?:\n###|\n\*\*|$)/.exec(text)
  if (!sec) return { error: "no 'Current members' section in the identity-scoped rule file" }
  const tables = [...sec[1].matchAll(/^\|\s*`([\w]+)`\s*\|/gm)].map((m) => m[1])
  if (tables.length === 0) return { error: "'Current members' table parsed to ZERO rows — the format changed" }
  if (tables.length > 20) return { error: `'Current members' parsed ${tables.length} rows — implausible, the pattern is over-matching` }
  return { tables }
}

export function orgIdFindings(sql, file, allow, baseline) {
  const out = []
  for (const { table, body } of createTables(sql)) {
    if (allow.includes(table) || baseline.includes(table)) continue
    if (!/\borg_id\b/i.test(body))
      out.push(`${file}: CREATE TABLE ${table} has no org_id and is not identity-scoped — nothing else in the repo inspects schema for this`)
  }
  return out
}

export function audit(root = ".") {
  const out = []
  const dir = join(root, MIG)
  if (!existsSync(dir)) return [`${MIG} does not exist — the enumeration is empty, which is not a pass`]

  // Recursive: a thirteenth migration dropped in a SUBDIRECTORY passed M-006, because the check
  // that asserts "exactly these twelve files" only ever listed the top level. The set is the set.
  //
  // EVERY file, not every `.sql`. The extension filter was a third way past the same assertion —
  // `.pgsql`, `.SQL`, `.sql.txt` were all invisible — and enumerating extensions is the same losing
  // game as enumerating client helpers two rules over. The directory holds exactly the twelve files
  // and nothing else, so "anything not on the list is a finding" is both simpler and stricter. A
  // legitimate addition (a README) is then a one-line, visible, argued edit to EXPECTED_FILES.
  //
  // Symlinked directories are FOLLOWED. `readdirSync(withFileTypes)` does not resolve them, so
  // `isDirectory()` is false for a symlink and the whole subtree was skipped — and this repo already
  // keeps a symlinked directory (`brief/` → OneDrive), so it is a live pattern, not a hypothetical.
  // Cycles are bounded by realpath, because a symlink loop is a hang, not a finding.
  const seen = new Set()
  const listFiles = (d, prefix = "") => {
    const out = []
    let real
    try { real = realpathSync(d) } catch { return out }
    if (seen.has(real)) return out
    seen.add(real)
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      let isDir = e.isDirectory()
      if (!isDir && e.isSymbolicLink()) {
        try { isDir = statSync(p).isDirectory() } catch { isDir = false }
      }
      if (isDir) out.push(...listFiles(p, `${prefix}${e.name}/`))
      else out.push(`${prefix}${e.name}`)
    }
    return out
  }
  const found = listFiles(dir).sort()

  // 1 — the file set
  for (const f of found) if (!EXPECTED_FILES.includes(f))
    out.push(`${MIG}/${f}: NEW migration file — doctrine is amend-forward into the existing twelve`)
  for (const f of EXPECTED_FILES) if (!found.includes(f))
    out.push(`${MIG}/${f}: expected migration file is MISSING`)

  const rulePath = join(root, RULE)
  const parsed = existsSync(rulePath)
    ? identityScopedTables(readFileSync(rulePath, "utf8"))
    : { error: `${RULE} not found — the org_id allowlist has no source` }
  if (parsed.error) out.push(parsed.error)
  const allow = parsed.tables ?? []

  const basePath = join(root, BASELINE)
  const b = existsSync(basePath) ? JSON.parse(readFileSync(basePath, "utf8")) : {}
  const baseline = Object.keys(b.orgIdTables ?? {})
  const policyBaseline = new Set(Object.keys(b.policies ?? {}))

  for (const f of found) {
    const sql = stripComments(readFileSync(join(dir, f), "utf8"))
    out.push(...policyFindings(sql, `${MIG}/${f}`).filter((x) => {
      // NOTE: written with the editor, not through a shell string. The first version of this line
      // was inserted via `node -e '…'` and the shell ate the backslashes — \S+ became S+, [\w."]
      // became [w."]. That is the 328-findings bug reproduced exactly, in the check whose own
      // header warns about it, forty lines below the warning. Regexes do not survive shell layers.
      const m = /CREATE POLICY (".*?"|\S+) ON ([\w."]+)/.exec(x)
      return !m || !policyBaseline.has(`${f}: ${m[1].replace(/"/g, "")}@${m[2]}`)
    }))
    if (!parsed.error) out.push(...orgIdFindings(sql, `${MIG}/${f}`, allow, baseline))
  }
  return out
}

// ── selftest ────────────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (cond, label) => { if (!cond) failed++; console.log(`  ${cond ? "✓" : "✗"} ${label}`) }

  // KNOWN-GOOD seeded from a REAL migration, not authored. If no real paired policy exists this
  // fixture is meaningless, so that is asserted rather than assumed.
  const real = readFileSync(join(MIG, "009_security.sql"), "utf8")
  const realStripped = stripComments(real)
  const firstPair = /DROP\s+POLICY\s+IF\s+EXISTS[\s\S]{0,400}?CREATE\s+POLICY/i.exec(realStripped)
  ok(Boolean(firstPair), "the real migration actually contains a DROP→CREATE pair to seed from")
  if (firstPair) ok(policyFindings(firstPair[0], "fixture").length === 0,
    "KNOWN-GOOD: a real DROP→CREATE pair, copied verbatim, passes")

  ok(policyFindings(`CREATE POLICY "x" ON t FOR SELECT USING (true);`, "f").length === 1,
    "an unpaired CREATE POLICY fires")
  ok(policyFindings(`DROP POLICY IF EXISTS "x" ON t;\nCREATE POLICY "x" ON t FOR SELECT USING (true);`, "f").length === 0,
    "a paired CREATE POLICY stays quiet")
  // Order matters: a DROP *after* the CREATE does not protect it.
  ok(policyFindings(`CREATE POLICY "x" ON t FOR SELECT USING (true);\nDROP POLICY IF EXISTS "x" ON t;`, "f").length === 1,
    "a DROP that comes AFTER the CREATE does not count")
  // The drop must be for the same policy AND the same table.
  ok(policyFindings(`DROP POLICY IF EXISTS "x" ON other;\nCREATE POLICY "x" ON t USING (true);`, "f").length === 1,
    "a DROP on a DIFFERENT table does not pair")
  ok(policyFindings(`DROP POLICY IF EXISTS "y" ON t;\nCREATE POLICY "x" ON t USING (true);`, "f").length === 1,
    "a DROP of a DIFFERENT policy does not pair")
  ok(policyFindings(stripComments(`-- CREATE POLICY "x" ON t USING (true);`), "f").length === 0,
    "a CREATE POLICY inside a comment is not DDL")

  // The two ALTERNATIVE idempotency patterns. Both were discovered by classifying real findings
  // per site; neither was imagined. Without these the check has a 78% false-positive rate.
  // The guard fixtures carry their `END IF;` because the real ones do — a truncated fixture stops
  // exercising the extent test below and would pass for the wrong reason (L-06).
  ok(policyFindings(`IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='t' AND policyname='p') THEN\nCREATE POLICY "p" ON t USING (true);\nEND IF;`, "f").length === 0,
    "a CREATE guarded by IF NOT EXISTS(pg_policies) is idempotent — quiet")
  ok(policyFindings(`IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='other') THEN\nCREATE POLICY "p" ON t USING (true);\nEND IF;`, "f").length === 1,
    "…but a guard naming a DIFFERENT policy does not protect this one")
  ok(policyFindings(`EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.name);\nCREATE POLICY "p" ON storage.objects USING (true);`, "f").length === 0,
    "a dynamic DROP loop over the table protects CREATEs below it — quiet")
  ok(policyFindings(`EXECUTE format('DROP POLICY IF EXISTS %I ON other_table', pol.name);\nCREATE POLICY "p" ON storage.objects USING (true);`, "f").length === 1,
    "…but a dynamic loop over a DIFFERENT table does not")
  // FOURTH pattern — the one that turned 2 of the "6 real defects" into non-defects.
  ok(policyFindings(`DO $$ BEGIN\n  CREATE POLICY "p" ON t FOR ALL USING (true);\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`, "f").length === 0,
    "a CREATE wrapped in EXCEPTION WHEN duplicate_object is idempotent — quiet")
  ok(policyFindings(`DO $$ BEGIN\n  CREATE POLICY "p" ON t FOR ALL USING (true);\nEXCEPTION WHEN others THEN NULL;\nEND $$;`, "f").length === 1,
    "…but a DO block catching something else does not protect it")
  // Both guards were FILE-GLOBAL until adversarial review: a guard anywhere in the file protected
  // any same-named CREATE, and a CREATE inherited the handler of a DO block it was not inside.
  ok(policyFindings(`IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='other' AND policyname='p') THEN\nCREATE POLICY "p" ON t USING (true);\nEND IF;`, "f").length === 1,
    "a guard naming the policy on a DIFFERENT table does not protect it")
  ok(policyFindings(`IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='t' AND policyname='p') THEN\nCREATE POLICY "p" ON t USING (true);\nEND IF;`, "f").length === 0,
    "…and one naming the same policy AND table does")
  ok(policyFindings(`CREATE POLICY "p" ON t USING (true);\nDO $$ BEGIN\n  CREATE POLICY "q" ON t USING (true);\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`, "f").some((x) => x.includes('"p"')),
    "a CREATE ABOVE an unrelated DO block does not inherit its handler")

  // POSITION, the half `hasExistenceGuard` was still missing after the DO-block twin was fixed.
  // A guard protects the CREATE it ENCLOSES and no other. Reproduced against 005: appending a bare
  // duplicate of a guarded policy left the file reporting 0 findings.
  const guarded = `IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='t' AND policyname='p') THEN\nCREATE POLICY "p" ON t USING (true);\nEND IF;`
  ok(policyFindings(`${guarded}\nCREATE POLICY "p" ON t USING (true);`, "f").length === 1,
    "a BARE duplicate BELOW a real guard fires — the guard does not extend past its END IF")
  ok(policyFindings(`CREATE POLICY "p" ON t USING (true);\n${guarded}`, "f").length === 1,
    "…and one ABOVE it fires too — a guard cannot protect what precedes it")
  ok(policyFindings(guarded, "f").length === 0,
    "KNOWN-GOOD: the enclosed CREATE itself is still quiet")
  ok(policyFindings(`IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='t' AND policyname='p') THEN\nCREATE POLICY "p" ON t USING (true);`, "f").length === 1,
    "a guard with no END IF has no establishable extent, so it protects nothing")

  // org_id, both directions
  const A = ["user_passkeys"]
  ok(orgIdFindings(`CREATE TABLE leases (id uuid, rent int);`, "f", A, []).length === 1,
    "a table with no org_id fires")
  ok(orgIdFindings(`CREATE TABLE leases (id uuid, org_id uuid NOT NULL);`, "f", A, []).length === 0,
    "a table WITH org_id stays quiet")
  ok(orgIdFindings(`CREATE TABLE user_passkeys (id uuid, credential_id text);`, "f", A, []).length === 0,
    "an identity-scoped table is exempt")
  ok(orgIdFindings(`CREATE TABLE prime_rates (id uuid);`, "f", A, ["prime_rates"]).length === 0,
    "a baselined table is exempt")
  // Balanced extraction: a nested paren must not truncate the body before org_id.
  ok(orgIdFindings(`CREATE TABLE t (id uuid DEFAULT gen_random_uuid(), org_id uuid);`, "f", A, []).length === 0,
    "a nested () in a column default does not truncate the body")
  // The AS-SELECT form has no parenthesised body and was invisible to the paren-walk entirely.
  ok(orgIdFindings(`CREATE TABLE summary AS SELECT id, name FROM leases;`, "f", A, []).length === 1,
    "CREATE TABLE … AS SELECT with no org_id fires")
  ok(orgIdFindings(`CREATE TABLE summary AS SELECT id, org_id FROM leases;`, "f", A, []).length === 0,
    "…and passes when the projection carries org_id")

  // allowlist parsing, both directions
  const good = identityScopedTables("### Current members (exhaustive)\n\n| Table | Why |\n|---|---|\n| `user_passkeys` | x |\n| `passkey_challenges` | y |\n")
  ok(good.tables?.length === 2, `parses the real allowlist shape (got ${good.tables?.length})`)
  ok(Boolean(identityScopedTables("no such section").error), "a missing 'Current members' section FAILS rather than exempting nothing")
  ok(Boolean(identityScopedTables("### Current members\n\n| Table |\n|---|\n").error), "a zero-row parse FAILS rather than passing silently")

  // The live allowlist must parse — the fixtures above prove the parser, this proves the subject.
  const live = identityScopedTables(readFileSync(RULE, "utf8"))
  ok(!live.error && live.tables.length >= 3, `the LIVE rule file parses (${live.tables?.length ?? live.error})`)

  // M-006 — the file-set assertion, probed through audit() on a scratch root. This is the whole
  // point of the entry: a thirteenth migration file passes every other gate in the repo.
  {
    const tmp = mkdtempSync(join(tmpdir(), "migint-"))
    mkdirSync(join(tmp, MIG), { recursive: true })
    for (const f of EXPECTED_FILES) writeFileSync(join(tmp, MIG, f), "-- empty\n")
    mkdirSync(join(tmp, ".claude", "rules"), { recursive: true })
    writeFileSync(join(tmp, RULE), "### Current members\n\n| Table | Why |\n|---|---|\n| `user_passkeys` | x |\n")
    ok(audit(tmp).length === 0, "KNOWN-GOOD: exactly the twelve named files passes")

    writeFileSync(join(tmp, MIG, "013_new_domain.sql"), "-- a thirteenth file\n")
    const extra = audit(tmp)
    ok(extra.some((x) => x.includes("013_new_domain.sql") && x.includes("NEW migration file")),
      "a THIRTEENTH migration file fires — the gap M-006 names")

    rmSync(join(tmp, MIG, "013_new_domain.sql"))

    // ── The three ways past the set assertion that the top-level `.sql` plant above cannot see ──
    // That plant fires on the PRE-recursion code too, so it never distinguished fixed from unfixed
    // and the recursion fix shipped with no fixture of its own.
    mkdirSync(join(tmp, MIG, "archive"), { recursive: true })
    writeFileSync(join(tmp, MIG, "archive", "013_hidden.sql"), "-- in a subdirectory\n")
    ok(audit(tmp).some((x) => x.includes("archive/013_hidden.sql")),
      "a thirteenth file in a SUBDIRECTORY fires — the plant the top-level one cannot make")
    rmSync(join(tmp, MIG, "archive"), { recursive: true, force: true })

    writeFileSync(join(tmp, MIG, "013_hidden.pgsql"), "-- a different extension\n")
    ok(audit(tmp).some((x) => x.includes("013_hidden.pgsql")),
      "a non-.sql extension fires — enumerating extensions is the losing game")
    rmSync(join(tmp, MIG, "013_hidden.pgsql"))

    // Symlinked directories: readdirSync(withFileTypes) reports isDirectory() FALSE for one, so the
    // whole subtree was skipped. Skipped where the platform refuses the link rather than silently
    // passing — an unprobed case must not read as a probed one.
    {
      const outside = join(tmp, "outside")
      mkdirSync(outside, { recursive: true })
      writeFileSync(join(outside, "013_via_symlink.sql"), "-- reached only through a symlink\n")
      let linked = false
      try { symlinkSync(outside, join(tmp, MIG, "linked"), "junction"); linked = true } catch { /* no privilege */ }
      if (linked) {
        ok(audit(tmp).some((x) => x.includes("013_via_symlink.sql")),
          "a thirteenth file behind a SYMLINKED directory fires — this repo already keeps one (brief/)")
        rmSync(join(tmp, MIG, "linked"), { recursive: true, force: true })
      } else {
        console.log("  – SKIPPED (no symlink privilege) — a thirteenth file behind a symlinked directory")
      }
    }

    rmSync(join(tmp, MIG, "006_seed.sql"))
    ok(audit(tmp).some((x) => x.includes("006_seed.sql") && x.includes("MISSING")),
      "a DELETED expected file fires too — the set is exact in both directions")
    rmSync(tmp, { recursive: true, force: true })
  }

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on each violation, quiet on real known-good SQL")
  process.exit(failed ? 1 : 0)
}

// Only run when invoked directly. Without this, importing the module to reuse `policyFindings`
// executes the whole audit and exits — which is exactly what happened the first time this file
// was imported for a classification pass. A module with top-level side effects cannot be probed
// independently, and being probeable independently is the entire reason these are exported.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href
if (!invokedDirectly) {
  // imported — expose the API and do nothing else
} else {

const findings = audit(".")
if (findings.length) {
  console.log(`\n❌ ${findings.length} migration-integrity finding(s):\n`)
  for (const f of findings) console.log(`  ${f}`)
  process.exit(1)
}
console.log(`🧱 migration integrity — ${EXPECTED_FILES.length} files, policy pairing + org_id clean`)
}
