/**
 * scripts/check-migration-forward-refs.mjs — a migration may not reference a table created later
 *
 * NOW.md item 15. On 2026-08-17 the new CI db-tests job failed on its first run because
 * `004_leases_financials.sql` declared `leases.originating_application_id uuid REFERENCES
 * applications(id)` while `applications` is created in `005_operations.sql`. A fresh 001→012 replay
 * died with `relation "applications" does not exist`. The migrations could still PATCH an existing
 * database; they could no longer BUILD one.
 *
 * WHY A STATIC CHECK RATHER THAN LETTING THE REPLAY FIND THEM. Postgres aborts at the FIRST bad
 * statement, so a replay surfaces exactly one forward reference per CI run — fix, push, wait ~4
 * minutes, discover the next. This reads every reference in one pass and reports all of them.
 *
 * WHY NEITHER EXISTING CHECK SAW IT. `check-schema-drift.mjs` compares production against the
 * migrations, and `schema-manifest.json` is generated FROM production — so a defect both artefacts
 * inherited together agrees with itself. Independent verification needs an independent reference
 * point; here that reference is replay ORDER, which is a property of the files alone.
 *
 * Rules enforced:
 *   · a `REFERENCES <table>` in file N must not name a table first created in file M > N
 *   · within one file, the reference must not appear ABOVE the CREATE TABLE — same failure, same file
 *   · a reference to a table no migration creates is reported too (it can only work by accident)
 *
 * Schema-qualified references (`auth.users`, `storage.objects`) are skipped: those belong to the
 * Supabase platform and exist before migration 001 runs.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const DIR = "supabase/migrations"

/** Platform-owned tables that exist before 001 — not created by any migration, and that is correct. */
const PLATFORM_TABLES = new Set(["users", "objects", "buckets"])

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
if (files.length === 0) throw new Error(`no .sql files in ${DIR} — glob decayed?`)

/** table name -> { fileIndex, file, line } for the FIRST create we see in replay order. */
const created = new Map()
/** every reference: { table, fileIndex, file, line, schemaQualified } */
const refs = []

const CREATE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i
// ⚠ THE LOOKBEHIND IS LOAD-BEARING. `communication_preferences` and `contractor_preferences` CONTAIN
// the substring "references" (p-references), and `\b` does not help because `_` is a word character —
// so a naive /REFERENCES\s+/ matched 16 ordinary statements like
// `ALTER TABLE communication_preferences ADD CONSTRAINT ...` and reported "table ADD" as uncreated.
// A check with 16 false positives gets an allowlist with 16 entries and then means nothing.
const REF_RE = /(?<![A-Za-z0-9_])REFERENCES\s+(?:"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\.\s*)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi

files.forEach((file, fileIndex) => {
  const lines = readFileSync(join(DIR, file), "utf8").split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (line.startsWith("--")) return   // a comment is documentation, not a statement

    const create = line.match(CREATE_RE)
    if (create && !created.has(create[1])) {
      created.set(create[1], { fileIndex, file, line: i + 1 })
    }

    for (const m of raw.matchAll(REF_RE)) {
      const [, schema, table] = m
      refs.push({ table, schema, fileIndex, file, line: i + 1 })
    }
  })
})

const failures = []
for (const ref of refs) {
  // `auth.users`, `storage.objects` — platform schemas, present before 001.
  if (ref.schema && ref.schema !== "public") continue
  if (!ref.schema && PLATFORM_TABLES.has(ref.table) && !created.has(ref.table)) continue

  const def = created.get(ref.table)
  if (!def) {
    failures.push(
      `UNCREATED   ${ref.table}\n    referenced at ${ref.file}:${ref.line}\n` +
      `    No migration creates this table. If it is platform-owned, schema-qualify the reference\n` +
      `    (auth.x / storage.x) so this check can tell the two cases apart.`,
    )
    continue
  }
  if (def.fileIndex > ref.fileIndex) {
    failures.push(
      `FORWARD REF ${ref.table}\n    referenced at ${ref.file}:${ref.line}\n` +
      `    but created at ${def.file}:${def.line}, which replays LATER.\n` +
      `    A fresh 001→012 replay dies here with 'relation "${ref.table}" does not exist'. Keep the\n` +
      `    column where domain routing puts it and move the CONSTRAINT to a file at or after ${def.file}\n` +
      `    (guarded with a pg_constraint existence check, so it stays idempotent against a live DB).`,
    )
  } else if (def.fileIndex === ref.fileIndex && def.line > ref.line) {
    failures.push(
      `FORWARD REF ${ref.table}\n    referenced at ${ref.file}:${ref.line}, created lower in the SAME file at line ${def.line}.\n` +
      `    Same failure as a cross-file forward reference — statements execute top to bottom.`,
    )
  }
}

console.log(`🔗 migration forward references — ${refs.length} REFERENCES across ${files.length} files, ${created.size} tables created`)

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} problem${failures.length === 1 ? "" : "s"}:\n`)
  for (const f of failures) console.error(`  ${f}\n`)
  process.exit(1)
}

console.log("✅ every REFERENCES names a table created earlier — 001→012 is replayable in order")
