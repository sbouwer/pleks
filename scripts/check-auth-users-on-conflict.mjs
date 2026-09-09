#!/usr/bin/env node
/**
 * scripts/check-auth-users-on-conflict.mjs — an INSERT into `auth.users` may not infer its
 * conflict arbiter from `email`
 *
 * Auth:   none — local/CI script
 * Data:   git-tracked `*.sql`, plus SQL embedded in `*.ts`/`*.tsx`/`*.mts`/`*.mjs`/`*.js` strings
 * Notes:  M-022 in docs/MECHANISABLE.md — the SQL half. `.claude/rules/schema-gotchas.md` states
 *         the rule: "`auth.users` carries a PARTIAL unique index on email — a bare
 *         `ON CONFLICT (email)` will fail. Use SELECT-first to check existence before INSERT."
 *
 * WHY IT FAILS, AND WHY IT FAILS LOUDLY-BUT-LATE. `ON CONFLICT (<cols>)` is an *inference*
 * specification: Postgres must resolve it to a unique index at PLAN time, and errors 42P10
 * ("there is no unique or exclusion constraint matching the ON CONFLICT specification") when it
 * cannot. `auth.users` is platform-owned — no migration in this repo creates it, so the schema
 * this repo can see says nothing about it, and `scripts/schema-manifest.json` (generated from
 * PostgREST, which cannot reach the `auth` schema) carries zero rows for it. Nothing in the
 * repo's static picture contradicts the statement, and nothing catches it either: the failure
 * arrives when the migration or seed script actually runs, which for a migration means it aborts
 * partway and leaves everything below it unapplied — the same class as the missing
 * `DROP POLICY IF EXISTS` scar in CLAUDE.md §6.
 *
 * WHY A NEW SCRIPT RATHER THAN AN EXTENSION OF `schema-contract-scan.mjs` (which the M-022 sketch
 * proposed). That scan reads PostgREST call chains against a manifest and explicitly EXCLUDES
 * `scripts/`; it has no SQL-text parser, and its manifest has no `auth` schema to check against.
 * The TS half of this rule is already covered there — and covered more strongly than M-022 asked,
 * because PostgREST cannot reach `auth` at all, so every `.from("auth.users")` fails the relation
 * check regardless of the conflict target. Measured at HEAD: zero `.from("auth.users")` sites
 * exist anywhere in the tree, so that half has nothing live to catch.
 *
 * ⚠ THE DISCRIMINATOR IS THE WHOLE BUILD, and M-022 says so in advance: a naive grep for
 * `ON CONFLICT (email)` scores 1 for 2 on this tree. It flags `006_seed.sql:543`, which is
 * `INSERT INTO honeytoken_emails ... ON CONFLICT (email) DO NOTHING` — legitimate, because
 * `honeytoken_emails.email` IS the primary key (`001_foundation.sql:826`). So the conflict clause
 * cannot be matched on its own: it has to be resolved back to the `INSERT INTO` that owns it.
 * That attribution is nearest-preceding-INSERT within the statement, which also gets the CTE form
 * (`WITH x AS (INSERT INTO a …) INSERT INTO auth.users … ON CONFLICT …`) right.
 *
 * WHAT IS SAFE AND MUST NOT BE FLAGGED — three shapes, all of them live in this tree:
 *   · `ON CONFLICT DO NOTHING` with no arbiter at all. This needs no unique index and is the
 *     correct spelling when you only want idempotence. `test/db/tier.ts:64` uses exactly this.
 *   · `ON CONFLICT (id)` — `auth.users.id` is the primary key, so inference resolves.
 *   · SELECT-first, then a bare `INSERT` — the pattern the rule prescribes.
 *     `scripts/seed-test-data-2.sql:17-33` is this, and it is why the live defect count is zero.
 *
 * COVERAGE BOUNDARY, stated rather than implied (CLAUDE.md §4). This check knows exactly one
 * fact about one platform table: `auth.users` has no index that a bare `(email)` arbiter can
 * resolve to. What it carries is `users_email_partial_key`, `UNIQUE (email) WHERE (is_sso_user =
 * false)` — read live from `pg_indexes` on project noexjtlrffkzzclibvbq, 2026-09-09. Arbiter
 * inference will not select a PARTIAL index unless the clause repeats its predicate, so the
 * outcome is 42P10 either way and this check's behaviour is unchanged; only the reason is. It
 * said "no unique index on `email` alone" until 2026-09-09, which was the stronger and wrong
 * claim. It does NOT verify arbiters against the schema generally — an `ON CONFLICT (col)` on a
 * public table whose `col` carries no unique index fails identically at runtime and is invisible here. That would
 * need the migration-derived index set, is a different build, and is not claimed by this file.
 * Three smaller edges, named so nobody has to rediscover them. SQL assembled dynamically and run
 * through `EXECUTE format(…)` is not reached (the format string is an ordinary literal and gets
 * masked with the rest of them). In a `.ts`/`.js` file only COMMENTS are masked, not strings —
 * so a doc-string quoting a complete `INSERT INTO auth.users … ON CONFLICT (email)` would be
 * reported. That direction is a visible false alarm at the gate rather than a silent miss, which
 * is the trade this check takes wherever it has to choose.
 *
 * And the third, which is LATENT rather than live and is recorded because it is invisible until it
 * bites: `maskOnce` closes a single-quoted literal on `''` doubling, the standard-conforming
 * spelling, and does NOT treat a backslash as an escape. In a Postgres **E-string** (`E'…'`) a
 * `\'` IS an escaped quote, so `E'don\'t'` would close early here and desynchronise everything
 * after it. Measured on this tree 2026-08-28: no `.sql` file contains an E-string with a
 * backslash-escaped quote, so nothing is mis-scanned today. **The reconciliation guard below is
 * what makes this safe to leave** — a desync drops a clause nothing claims, and that is reported
 * as a parse failure rather than passing as a clean file. Fix it in `maskOnce` when the first such
 * literal lands; do not wait for a silent miss, because there will not be one.
 *
 * Run with `--list` to print every ON CONFLICT clause with the table it was attributed to — the
 * classification view, and the thing to read before believing any change to the parser.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { blankComments } from "./lib/blank-comments.mjs"

/** The one platform table whose email column carries no standalone unique index. */
const TARGET_TABLE = "auth.users"

/** Same length, same newline positions, no content — the padding every layer is built from. */
const blankRun = (s) => s.replace(/[^\n]/g, " ")

const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/

/**
 * One lexing pass: blank SQL comments, single-quoted literals and dollar-quoted bodies, preserving
 * length so offsets and line numbers survive. LINEAR AND REGEX-FREE, for the reason
 * `scripts/lib/blank-comments.mjs` gives. Returns the masked text, the dollar-quoted body spans it
 * blanked, and the first unterminated construct if any.
 *
 * Double-quoted identifiers are TRACKED BUT PRESERVED, and the distinction is load-bearing: a
 * quoted identifier's contents are the very thing this check reads (`"auth"."users"` is a legal
 * spelling of the target), so blanking them would create a bypass that looks like a clean tree.
 * Tracking them still matters, because an apostrophe inside one ("it's a table", legal if odd)
 * would otherwise open a phantom string literal and swallow the rest of the file.
 */
function maskOnce(src) {
  let out = ""
  let i = 0
  let unterminated = null
  const bodies = []
  const blank = (ch) => (ch === "\n" ? "\n" : " ")
  while (i < src.length) {
    const c = src[i]
    const dollar = c === "$" ? DOLLAR_TAG.exec(src.slice(i, i + 64)) : null
    if (dollar) {
      const delim = dollar[0]
      const start = i
      const close = src.indexOf(delim, i + delim.length)
      if (close === -1) {
        unterminated ??= { kind: "dollar-quoted body", offset: start }
        out += blankRun(src.slice(i)); i = src.length
        continue
      }
      bodies.push({ delimStart: i, start: i + delim.length, end: close })
      out += blankRun(src.slice(i, close + delim.length))
      i = close + delim.length
    } else if (c === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++ }
    } else if (c === "/" && src[i + 1] === "*") {
      // Postgres block comments nest, unlike C's.
      let depth = 0
      const start = i
      while (i < src.length) {
        if (src[i] === "/" && src[i + 1] === "*") { depth++; out += "  "; i += 2; continue }
        if (src[i] === "*" && src[i + 1] === "/") {
          depth--; out += "  "; i += 2
          if (depth === 0) break
          continue
        }
        out += blank(src[i]); i++
      }
      if (depth !== 0) unterminated ??= { kind: "block comment", offset: start }
    } else if (c === "'") {
      const start = i
      out += " "; i++
      let closed = false
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") { out += "  "; i += 2; continue }
        if (src[i] === "'") { out += " "; i++; closed = true; break }
        out += blank(src[i]); i++
      }
      if (!closed) unterminated ??= { kind: "string literal", offset: start }
    } else if (c === '"') {
      const start = i
      out += '"'; i++
      let closed = false
      while (i < src.length) {
        if (src[i] === '"' && src[i + 1] === '"') { out += '""'; i += 2; continue }
        if (src[i] === '"') { out += '"'; i++; closed = true; break }
        out += src[i]; i++
      }
      if (!closed) unterminated ??= { kind: "quoted identifier", offset: start }
    } else {
      out += c; i++
    }
  }
  return { masked: out, bodies, unterminated }
}

/**
 * ⚠ A DOLLAR-QUOTED BODY GETS ITS OWN LAYER; IT IS NEVER SPLICED BACK INTO THE STATEMENT AROUND
 * IT. The first draft treated `$$ … $$` as ordinary text and was WRONG ON THE REAL TREE. To the
 * outer parser a `$$ … $$` body is a string literal, so its contents obey no lexical rules at all:
 * `007_enhancements.sql`'s lease-clause library holds pages of legal prose inside them, full of
 * `manufacturer's` and `lessee's` and sentence semicolons. Every stray apostrophe opened a phantom
 * string literal, every semicolon in a sentence read as a statement terminator, and one real
 * `ON CONFLICT (clause_key)` clause silently fell outside its own INSERT's bounds — 77 clauses
 * attributed against 78 live, a one-clause gap visible only because the two numbers were compared.
 * A parser desynchronised across a 700-line region reports a clean file.
 *
 * Blanking the bodies and stopping there would fix that and open a different hole: a plpgsql
 * function body is ALSO dollar-quoted, and a function body is exactly where a migration would
 * write to `auth.users`. So this returns LAYERS — full-length buffers that all share the file's
 * newline positions, hence its line numbers. Layer 0 is the file with every body blanked; each
 * further layer is one body's contents, re-lexed from scratch and padded back to full length.
 * Scanning them separately is the point: nothing inside a body can terminate a statement outside
 * it, and nothing outside can reach in.
 *
 * WHICH bodies become layers is decided by the token in front of them, and that is a rule rather
 * than a guess: Postgres only ever executes a dollar-quoted string as code when it is a routine
 * body — `CREATE FUNCTION … AS $$…$$` or `DO $$…$$`. Everywhere else the string is data, whatever
 * it happens to contain. Scanning every clean-lexing body instead would mean a lease clause whose
 * prose quoted this very defect became a finding, which is the "check reads its own documentation
 * as code" trap `scripts/lib/blank-comments.mjs` records this repo falling into three times.
 *
 * A routine body that will not lex is DROPPED rather than reported, and only a top-level lexing
 * failure propagates. That is sound here where a splice was not: an unreadable body costs its own
 * layer and cannot corrupt any other.
 *
 * Known boundary, stated: SQL assembled dynamically and run through `EXECUTE format(…)` is not
 * reached — the format string is an ordinary literal and gets masked with the rest of them.
 */
const ROUTINE_INTRODUCERS = new Set(["AS", "DO"])

/**
 * The bare word immediately before `pos`, upper-cased. Scanned backwards from `pos` rather than
 * matched with an end-anchored regex over the whole prefix — that spelling is quadratic on a long
 * file and is the shape `sonarjs/super-linear-regex` exists to reject.
 */
function precedingWordAt(text, pos) {
  let end = pos
  while (end > 0 && /\s/.test(text[end - 1])) end--
  let start = end
  while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--
  return text.slice(start, end).toUpperCase()
}

export function maskSql(src) {
  const { masked, bodies, unterminated } = maskOnce(src)
  const layers = [masked]
  for (const b of bodies) {
    if (!ROUTINE_INTRODUCERS.has(precedingWordAt(masked, b.delimStart))) continue
    const inner = maskSql(src.slice(b.start, b.end))
    if (inner.unterminated) continue
    const before = blankRun(src.slice(0, b.start))
    const after = blankRun(src.slice(b.end))
    for (const layer of inner.layers) layers.push(before + layer + after)
  }
  return { masked, layers, unterminated }
}

// `(?<![A-Za-z0-9_])` rather than `\b`, for the reason check-migration-forward-refs.mjs records:
// `_` is a word character, so `\b` does not stop `some_insert into …` from matching.
const INSERT_RE =
  /(?<![A-Za-z0-9_])INSERT\s+INTO\s+(?:("?[A-Za-z_][A-Za-z0-9_$]*"?)\s*\.\s*)?("?[A-Za-z_][A-Za-z0-9_$]*"?)/gi
const CONFLICT_RE = /(?<![A-Za-z0-9_])ON\s+CONFLICT(?![A-Za-z0-9_])/gi
const ON_CONSTRAINT_RE = /^\s*ON\s+CONSTRAINT\s+("(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)/i
/**
 * Does this arbiter name `email`?
 *
 * ⚠ THE TWO ARBITER FORMS NEED DIFFERENT TESTS, and the first cut used one for both and scored a
 * false negative on the constraint form. A COLUMN LIST is code: `email` there is an identifier, so
 * the test is token-exact — `(?<![A-Za-z0-9_])` rather than `\b`, because `_` is a word character
 * and `\b` would let `contact_email_id` match. A CONSTRAINT NAME is a string chosen by whoever
 * wrote the constraint, and the conventional spelling is `users_email_key` — underscore on BOTH
 * sides of the word, which the token test rejects by construction. So that form tests a substring.
 *
 * That is a NAMING HEURISTIC, not a resolution, and it is stated as one: this check cannot look up
 * what a named constraint covers. It fires only when the name itself says email, which on a table
 * whose only real unique constraints are the `id` primary key and `phone` is a safe direction —
 * the miss (a constraint named without the word) is silence, never a false alarm.
 */
function namesEmail(arbiter) {
  return arbiter.kind === "constraint"
    ? /email/i.test(arbiter.target)
    : /(?<![A-Za-z0-9_])email(?![A-Za-z0-9_])/i.test(arbiter.target)
}

/** `"auth"` → `auth`; `"Users"` stays `Users` (quoted identifiers are case-sensitive in PG). */
function unquote(ident) {
  if (!ident) return ident
  return ident.startsWith('"') && ident.endsWith('"') && ident.length >= 2
    ? ident.slice(1, -1).replace(/""/g, '"')
    : ident.toLowerCase()
}

/**
 * The conflict arbiter that starts at `from` in `text`, or null when there is none.
 * Returns `{ kind: "columns" | "constraint", target }`. An arbiter-less `ON CONFLICT DO …`
 * returns null — it needs no unique index and is never a violation.
 */
function readArbiter(text, from) {
  const rest = text.slice(from)
  const paren = /^\s*\(/.exec(rest)
  if (paren) {
    let depth = 0
    let i = paren[0].length - 1
    for (; i < rest.length; i++) {
      if (rest[i] === "(") depth++
      else if (rest[i] === ")") { depth--; if (depth === 0) return { kind: "columns", target: rest.slice(paren[0].length, i) } }
    }
    return null // unbalanced — the file is malformed; the parse guard reports it
  }
  const named = ON_CONSTRAINT_RE.exec(rest)
  if (named) return { kind: "constraint", target: unquote(named[1]) }
  return null
}

/**
 * Pure, so both directions are testable without a repo.
 *
 * `mode` picks the lexer, not the rule. `"sql"` masks SQL comments, string literals and
 * dollar-quoted bodies (see `maskSql` for why the last of those become their own layers); `"js"`
 * masks `//` and `/* *\/` comments only and leaves strings ALONE, because in a `.ts` file the SQL
 * lives inside the string — masking it there would delete the very text being checked.
 */
export function findViolations(file, rawSrc, mode) {
  const { layers, unterminated } =
    mode === "sql" ? maskSql(rawSrc) : { layers: [blankComments(rawSrc)], unterminated: null }
  if (unterminated) return { violations: [], clauses: [], inserts: 0, conflicts: 0, live: 0, unterminated }

  const violations = []
  // Every resolved clause, violation or not. `--list` prints these: the point of this check is the
  // ATTRIBUTION, and "classify per site, never sweep" needs the per-site classification visible
  // rather than reconstructed from a passing exit code.
  const clauses = []
  let inserts = 0
  let conflicts = 0
  // Every `ON CONFLICT` that survived masking, whether or not an INSERT claimed it. The runner
  // asserts this equals `conflicts` — see the reconciliation guard there.
  let live = 0

  for (const masked of layers) {
    live += (masked.match(CONFLICT_RE) ?? []).length
    const found = [...masked.matchAll(INSERT_RE)].map((m) => ({
      schema: unquote(m[1]),
      table: unquote(m[2]),
      start: m.index,
      afterName: m.index + m[0].length,
    }))
    inserts += found.length

    found.forEach((ins, n) => {
      // The statement this INSERT owns runs to the first of: the next INSERT (the CTE form puts
      // two in one statement, and the arbiter belongs to the nearer one), the statement
      // terminator, or the end of the layer. Semicolons inside comments, string literals and
      // dollar-quoted bodies are already blanked out, so none of those can end a statement early.
      const semi = masked.indexOf(";", ins.afterName)
      const nextInsert = n + 1 < found.length ? found[n + 1].start : -1
      const bounds = [semi, nextInsert].filter((x) => x !== -1)
      const end = bounds.length ? Math.min(...bounds) : masked.length

      CONFLICT_RE.lastIndex = ins.afterName
      const hit = CONFLICT_RE.exec(masked)
      if (!hit || hit.index >= end) return
      conflicts++

      const qualified = ins.schema ? `${ins.schema}.${ins.table}` : ins.table
      const arbiter = readArbiter(masked, hit.index + hit[0].length)
      const site = {
        file,
        line: masked.slice(0, hit.index).split("\n").length,
        table: qualified,
        kind: arbiter?.kind ?? "none",
        target: arbiter ? arbiter.target.replace(/\s+/g, " ").trim() : "",
      }
      clauses.push(site)

      if (qualified !== TARGET_TABLE) return
      if (!arbiter) return // arbiter-less `ON CONFLICT DO NOTHING` — legal on any table
      if (!namesEmail(arbiter)) return
      violations.push(site)
    })
  }

  return { violations, clauses, inserts, conflicts, live, unterminated: null }
}

/**
 * Did the parse desynchronise? True when an `ON CONFLICT` survived masking that no INSERT claimed.
 *
 * ⚠ SQL FILES ONLY, and the narrowing is the guard's own premise rather than a convenience. In a
 * `.sql` file the grammar guarantees every conflict clause belongs to an INSERT, so an orphan is
 * proof the statement bounds slipped. In a `.ts` file the same words appear in ordinary prose —
 * `check-mention-fixtures.mjs`'s registry entry for THIS script contains both `INSERT INTO` and
 * `ON CONFLICT` in a sentence, and the first cut of the guard failed the gate on it. That is R6 in
 * this check's own vocabulary: a pattern matching a MENTION instead of the thing. Nothing is lost
 * by scoping it — the js path does no statement lexing and has nothing to desynchronise.
 */
export function unreconciled(result, mode) {
  return mode === "sql" && result.live !== result.conflicts
}

function selftest() {
  const cases = [
    // ── the defect, in the spellings it would actually be written ──────────────────────────
    ["the plain form FAILS", "sql",
      "INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'a@b.c') ON CONFLICT (email) DO NOTHING;", 1],
    ["DO UPDATE fails identically — 42P10 is raised at plan time, before any action runs", "sql",
      "INSERT INTO auth.users (email) VALUES ('a@b.c') ON CONFLICT (email) DO UPDATE SET email = excluded.email;", 1],
    ["a multi-column arbiter mentioning email FAILS — there is no such composite index either", "sql",
      "INSERT INTO auth.users (instance_id, email) VALUES (i, e) ON CONFLICT (instance_id, email) DO NOTHING;", 1],
    ["an expression arbiter over email FAILS", "sql",
      "INSERT INTO auth.users (email) VALUES (e) ON CONFLICT (lower(email)) DO NOTHING;", 1],
    ["a partial-index arbiter FAILS — the WHERE does not conjure the index", "sql",
      "INSERT INTO auth.users (email) VALUES (e) ON CONFLICT (email) WHERE deleted_at IS NULL DO NOTHING;", 1],
    ["ON CONSTRAINT naming an email constraint FAILS — the constraint does not exist", "sql",
      "INSERT INTO auth.users (email) VALUES (e) ON CONFLICT ON CONSTRAINT users_email_key DO NOTHING;", 1],
    ["the quoted-identifier spelling of the same table FAILS — it is the same table", "sql",
      `INSERT INTO "auth"."users" (email) VALUES (e) ON CONFLICT (email) DO NOTHING;`, 1],
    ["case and whitespace do not launder it", "sql",
      "insert\n  into   AUTH.USERS (email) values (e)\n  on\tconflict (EMAIL) do nothing;", 1],

    // ── KNOWN-GOOD: the shapes that are correct, and are live in this tree ─────────────────
    ["KNOWN-GOOD: the honeytoken seed — `ON CONFLICT (email)` on a table whose email IS the PK. " +
     "This is the site a naive grep flags, and the reason this check parses back to the INSERT", "sql",
      "INSERT INTO honeytoken_emails (email) VALUES ('a@b.c')\nON CONFLICT (email) DO NOTHING;", 0],
    ["KNOWN-GOOD: arbiter-less DO NOTHING on auth.users — needs no unique index (test/db/tier.ts:64)", "sql",
      "INSERT INTO auth.users (id, email) VALUES ('u', 'u@dbtest.local') ON CONFLICT DO NOTHING;", 0],
    ["KNOWN-GOOD: the primary key is a legal arbiter", "sql",
      "INSERT INTO auth.users (id, email) VALUES (i, e) ON CONFLICT (id) DO NOTHING;", 0],
    ["KNOWN-GOOD: ON CONSTRAINT naming the primary key is legal", "sql",
      "INSERT INTO auth.users (id) VALUES (i) ON CONFLICT ON CONSTRAINT users_pkey DO NOTHING;", 0],
    ["KNOWN-GOOD: a column that merely CONTAINS the word is a different column — the column-list " +
     "test is token-exact even though the constraint-name test is a substring", "sql",
      "INSERT INTO auth.users (id) VALUES (i) ON CONFLICT (contact_email_id) DO NOTHING;", 0],
    ["KNOWN-GOOD: the SELECT-first pattern the rule prescribes (scripts/seed-test-data-2.sql:17)", "sql",
      "SELECT id INTO v FROM auth.users WHERE email = 'a@b.c';\nIF v IS NULL THEN\n" +
      "  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'a@b.c');\nEND IF;", 0],
    ["KNOWN-GOOD: another schema's `users` is a different table", "sql",
      "INSERT INTO public.users (email) VALUES (e) ON CONFLICT (email) DO NOTHING;", 0],
    ["KNOWN-GOOD: an unqualified `users` is not auth.users — never guess the schema", "sql",
      "INSERT INTO users (email) VALUES (e) ON CONFLICT (email) DO NOTHING;", 0],
    ["KNOWN-GOOD: a bare INSERT with no conflict clause at all", "sql",
      "INSERT INTO auth.users (id, email) VALUES (i, e);", 0],
    ["KNOWN-GOOD: an identifier merely ENDING in `insert into` shape does not start a statement", "sql",
      "SELECT bulk_insert INTO x FROM t; INSERT INTO honeytoken_emails (email) VALUES (e) ON CONFLICT (email) DO NOTHING;", 0],

    // ── the prose-vs-code trap this repo has been caught by three times ────────────────────
    ["KNOWN-GOOD: a `--` comment describing the defect is not the defect", "sql",
      "-- never write INSERT INTO auth.users ... ON CONFLICT (email) DO NOTHING\n" +
      "INSERT INTO auth.users (id) VALUES (i) ON CONFLICT (id) DO NOTHING;", 0],
    ["KNOWN-GOOD: a /* block */ comment describing it is not it either", "sql",
      "/* INSERT INTO auth.users ... ON CONFLICT (email) */\nINSERT INTO auth.users (id) VALUES (i);", 0],
    ["KNOWN-GOOD: nested block comments close at the right place, not the first `*/`", "sql",
      "/* outer /* inner */ INSERT INTO auth.users (email) VALUES (e) ON CONFLICT (email) DO NOTHING; */\n" +
      "INSERT INTO auth.users (id) VALUES (i);", 0],
    ["KNOWN-GOOD: the defect quoted inside a string literal is data, not SQL", "sql",
      "INSERT INTO audit_log (detail) VALUES ('INSERT INTO auth.users ON CONFLICT (email)');", 0],
    ["a real violation AFTER a comment mentioning it is still caught — the masker must not swallow code", "sql",
      "-- see the gotcha in schema-gotchas.md\nINSERT INTO auth.users (email) VALUES (e) ON CONFLICT (email) DO NOTHING;", 1],
    ["an apostrophe inside a string does not desynchronise the scan", "sql",
      "INSERT INTO t (note) VALUES ('don''t');\nINSERT INTO auth.users (email) VALUES (e) ON CONFLICT (email) DO NOTHING;", 1],

    // ── attribution: which INSERT owns the clause ──────────────────────────────────────────
    ["the CTE form attributes the arbiter to the NEARER INSERT — auth.users owns this one", "sql",
      "WITH x AS (INSERT INTO honeytoken_emails (email) VALUES (e) RETURNING email)\n" +
      "INSERT INTO auth.users (email) SELECT email FROM x ON CONFLICT (email) DO NOTHING;", 1],
    ["KNOWN-GOOD: and the mirror image — auth.users first, the arbiter belongs to the other table", "sql",
      "WITH x AS (INSERT INTO auth.users (email) VALUES (e) RETURNING email)\n" +
      "INSERT INTO honeytoken_emails (email) SELECT email FROM x ON CONFLICT (email) DO NOTHING;", 0],
    ["KNOWN-GOOD: a LATER statement's conflict clause does not leak back across the semicolon", "sql",
      "INSERT INTO auth.users (id, email) VALUES (i, e);\n" +
      "INSERT INTO honeytoken_emails (email) VALUES (e) ON CONFLICT (email) DO NOTHING;", 0],
    ["two violations in one file are both reported, not just the first", "sql",
      "INSERT INTO auth.users (email) VALUES (a) ON CONFLICT (email) DO NOTHING;\n" +
      "INSERT INTO auth.users (email) VALUES (b) ON CONFLICT (email) DO NOTHING;", 2],
    // ── dollar-quoted bodies: their own layer, in both directions ─────────────────────────
    ["a violation inside a plpgsql $$ body is caught — a function body is where a migration would " +
     "most plausibly write to auth.users, so blanking bodies wholesale was not an option", "sql",
      "CREATE FUNCTION f() RETURNS void AS $$\nBEGIN\n" +
      "  INSERT INTO auth.users (email) VALUES (e) ON CONFLICT (email) DO NOTHING;\nEND;\n$$ LANGUAGE plpgsql;", 1],
    ["…and inside a TAGGED body too", "sql",
      "CREATE FUNCTION f() RETURNS void AS $fn$\nBEGIN\n" +
      "  INSERT INTO auth.users (email) VALUES (e) ON CONFLICT (email) DO NOTHING;\nEND;\n$fn$ LANGUAGE plpgsql;", 1],
    ["KNOWN-GOOD: the defect written as PROSE inside a $$ body is data, not SQL", "sql",
      "INSERT INTO lease_clause_library (key, body) VALUES ('x',\n" +
      "$$never write INSERT INTO auth.users ... ON CONFLICT (email) DO NOTHING$$);", 0],
    ["⚠ THE REGRESSION 007_enhancements.sql ACTUALLY HAD: prose in a $$ body, full of apostrophes " +
     "and sentence semicolons, must not truncate the statement that contains it — the real " +
     "ON CONFLICT then falls outside its own INSERT and the file scans clean", "sql",
      "INSERT INTO lease_clause_library (key, body) VALUES ('solar',\n" +
      "$$the manufacturer's instructions apply; the lessee's duty continues; and so on.$$)\n" +
      "ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body;\n" +
      "INSERT INTO auth.users (email) VALUES (e) ON CONFLICT (email) DO NOTHING;", 1],
    ["KNOWN-GOOD: a $$ body whose prose will not lex is DROPPED, not reported — its layer is lost, " +
     "and no other statement is affected", "sql",
      "INSERT INTO t (body) VALUES ($$it's one apostrophe and nothing closes it$$);\n" +
      "INSERT INTO auth.users (id) VALUES (i) ON CONFLICT (id) DO NOTHING;", 0],

    // ── SQL embedded in TS/JS strings — the population `schema-contract-scan` cannot see ───
    ["embedded SQL in a template literal FAILS", "js",
      "psql(`INSERT INTO auth.users (id, email) VALUES ('${id}', '${id}@x') ON CONFLICT (email) DO NOTHING;`)", 1],
    ["KNOWN-GOOD: the live test/db/tier.ts:64 shape — arbiter-less, and must stay passing", "js",
      "psql(`INSERT INTO auth.users (id, email) VALUES ('${id}', '${id}@dbtest.local') ON CONFLICT DO NOTHING;`)", 0],
    ["KNOWN-GOOD: a `//` comment describing the defect in a TS file is not the defect", "js",
      "// do not write INSERT INTO auth.users ... ON CONFLICT (email)\nconst q = 1", 0],
  ]

  let bad = 0
  for (const [label, mode, src, expected] of cases) {
    const got = findViolations("fixture", src, mode).violations.length
    const ok = got === expected
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${expected}, got ${got}`}`)
  }

  // The masker's failure mode is silence, so it gets its own direction rather than riding on the
  // cases above: an unterminated literal must be REPORTED, never parsed past.
  const torn = maskSql("INSERT INTO t (a) VALUES ('unclosed\nINSERT INTO auth.users …")
  const tornOk = torn.unterminated?.kind === "string literal"
  if (!tornOk) bad++
  console.log(`  ${tornOk ? "✓" : "✗"} an unterminated string literal is reported, not silently scanned past`)

  // The reconciliation guard is itself a control, so it is probed in both directions rather than
  // trusted. Counting violations cannot exercise it: a desynchronised scan finds ZERO violations,
  // which is what the guard is for.
  const recon = [
    ["KNOWN-GOOD: reconciles on the shape that used to desynchronise — every clause claimed by an INSERT",
      "sql",
      "INSERT INTO lease_clause_library (key, body) VALUES ('solar',\n" +
      "$$the manufacturer's instructions apply; the lessee's duty continues.$$)\n" +
      "ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body;", false],
    ["an ON CONFLICT no INSERT owns is REPORTED as a desync, not passed over in silence",
      "sql", "UPDATE t SET a = 1;\nON CONFLICT (email) DO NOTHING;", true],
    ["KNOWN-GOOD: the same orphan in a TS STRING is prose, not a desync — the guard would " +
     "otherwise fail on check-mention-fixtures.mjs's registry entry for this very script",
      "js", 'reason: "…its vocabulary is `INSERT INTO` / `ON CONFLICT`, which does not overlap…"', false],
  ]
  for (const [label, mode, src, shouldFire] of recon) {
    const r = findViolations("fixture", src, mode)
    const ok = unreconciled(r, mode) === shouldFire
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — live=${r.live}, attributed=${r.conflicts}`}`)
  }

  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-auth-users-on-conflict selftest green")
  process.exit(bad ? 1 : 0)
}

const SQL_GLOBS = ["*.sql"]
const CODE_GLOBS = ["*.ts", "*.tsx", "*.mts", "*.mjs", "*.js", "*.cjs"]

function tracked(globs) {
  return execFileSync("git", ["ls-files", "-z", ...globs], { encoding: "utf8" }).split("\0").filter(Boolean)
}

/**
 * ⚠ THIS FILE EXCLUDES ITSELF, AND THE REASON IS NOT TIDINESS — IT IS THE `js` MASKING RULE ONE
 * PARAGRAPH UP. In a `.ts`/`.js` file only comments are masked, never strings, because in a code
 * file the SQL *lives* in the string. This script's `--selftest` table holds ~20 complete
 * `INSERT INTO auth.users … ON CONFLICT (email)` statements as ordinary JS string literals, so the
 * scan reports every one of them the moment this file is git-tracked. That is the check reading its
 * own fixtures as code: the trap `scripts/lib/blank-comments.mjs` records this repo falling into
 * three times, and this is the fourth.
 *
 * It was invisible until the file was committed. `tracked()` is `git ls-files`, which does not
 * return an untracked path — so a scan run beside a brand-new, unstaged copy of this script skips
 * it silently and passes. **The clean run is the one that proves nothing here**; only `git add`
 * then re-run does.
 *
 * The exclusion is by RESOLVED PATH IDENTITY, never by filename. A name constant rots the moment
 * somebody renames the file — the exclusion stops matching, and it is a documented bypass for
 * anyone who names their file the same thing. `import.meta.url` cannot drift from the file it is
 * written in, so a rename carries the exclusion with it and nothing else can inherit it.
 *
 * No guard is needed on the exclusion firing, and that is a property of the failure rather than an
 * omission: if the comparison ever breaks, this file's own fixtures are reported and the gate goes
 * RED. There is no silent direction to protect against. The opposite error — excluding too much —
 * is bounded to exactly one path by construction.
 */
const SELF = resolve(fileURLToPath(import.meta.url))

function main() {
const targets = [
  ...tracked(SQL_GLOBS).map((f) => [f, "sql"]),
  // The code scan is prefiltered on `auth.users` — the same string the rule is about. A file that
  // does not name it cannot INSERT into it, in any spelling this check understands.
  ...tracked(CODE_GLOBS).map((f) => [f, "js"]),
].filter(([f]) => resolve(f) !== SELF)

const violations = []
const allClauses = []
const tornFiles = []
const desynced = []
let scanned = 0
let totalInserts = 0
let totalConflicts = 0

for (const [file, mode] of targets) {
  const src = readFileSync(file, "utf8")
  if (mode === "js" && !src.includes("auth.users")) continue
  if (!/insert\s+into/i.test(src)) continue
  scanned++
  const r = findViolations(file, src, mode)
  if (r.unterminated) { tornFiles.push(`${file} — unterminated ${r.unterminated.kind} at offset ${r.unterminated.offset}`); continue }
  // ⚠ THE RECONCILIATION IS THE PARSER'S OWN ALARM, and it exists because the first draft needed a
  // human to notice that 77 attributed clauses did not match 78 live ones. Every `ON CONFLICT` that
  // survives masking belongs to some INSERT — that is what the grammar says. One that no INSERT
  // claimed means the statement bounds desynchronised, which is silent by construction: a
  // desynchronised scan reports a clean file. Comparing the two counts every run makes that
  // failure loud instead of leaving it to whoever next runs the numbers by hand.
  if (unreconciled(r, mode)) desynced.push(`${file} — ${r.live} ON CONFLICT clause(s) present, ${r.conflicts} attributed to an INSERT`)
  allClauses.push(...r.clauses)
  totalInserts += r.inserts
  totalConflicts += r.conflicts
  violations.push(...r.violations)
}

// A scan that reads nothing reports nothing and exits 0, which at the gate is indistinguishable
// from a clean tree — the collapsed-analysis hole check-knip-floor exists to close. This tree has
// INSERT statements and it has ON CONFLICT clauses; if either population goes to zero, the parser
// broke, not the repo.
const floorFailures = []
if (scanned === 0) floorFailures.push("scanned 0 files containing an INSERT — the file glob or the prefilter decayed")
if (totalInserts === 0) floorFailures.push("parsed 0 INSERT statements across those files — INSERT_RE decayed")
if (totalConflicts === 0) floorFailures.push("parsed 0 ON CONFLICT clauses — the arbiter reader or the statement bounds decayed")

// `--list` is the classification view: every ON CONFLICT clause the parser resolved, with the
// table it was attributed to. Run it when changing the parser — a silent misattribution is the
// only way this check can be wrong in the direction that matters.
if (process.argv.includes("--list")) {
  for (const c of allClauses) {
    const arb = c.kind === "none" ? "(no arbiter)" : c.kind === "constraint" ? `ON CONSTRAINT ${c.target}` : `(${c.target})`
    console.log(`${c.file}:${c.line}  ${c.table}  ON CONFLICT ${arb}`)
  }
}

if (tornFiles.length || floorFailures.length || desynced.length) {
  console.error("✗ auth.users ON CONFLICT: the scan could not read the tree, so it is reporting nothing rather than success:")
  for (const f of [...floorFailures, ...tornFiles, ...desynced]) console.error(`   ${f}`)
  process.exit(1)
}

if (violations.length) {
  console.error("✗ INSERT into `auth.users` inferring its conflict arbiter from `email`:")
  for (const v of violations) {
    console.error(`   ${v.file}:${v.line} — ON CONFLICT ${v.kind === "constraint" ? `ON CONSTRAINT ${v.target}` : `(${v.target})`}`)
  }
  console.error(
    "\n   `auth.users` carries only a PARTIAL unique index on email (`users_email_partial_key`,\n" +
    "   `UNIQUE (email) WHERE is_sso_user = false`), and arbiter inference will not resolve to a\n" +
    "   partial index unless the clause repeats that predicate. Postgres raises 42P10 at plan\n" +
    "   time — a migration aborts there and leaves every\n" +
    "   statement below it unapplied. Use the SELECT-first pattern (see\n" +
    "   scripts/seed-test-data-2.sql:17), or a bare `ON CONFLICT DO NOTHING` if you only\n" +
    "   want idempotence — that form needs no unique index. See .claude/rules/schema-gotchas.md.",
  )
  process.exit(1)
}

console.log(
  `✅ auth.users conflict targets: ${scanned} file(s), ${totalInserts} INSERT statement(s), ` +
  `${totalConflicts} ON CONFLICT clause(s) — none infers an arbiter from auth.users.email`,
)
}

// The scan runs only when this file IS the command. `maskSql`/`findViolations` are exported so a
// probe can import them, and a module body that scanned the tree on import would run this check
// inside whatever imported it — the exact failure `scripts/lib/blank-comments.mjs` was extracted
// to fix, where importing one check executed another check's `--selftest` branch and its scan.
if (process.argv.includes("--selftest")) selftest()
else if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
