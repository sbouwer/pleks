#!/usr/bin/env node
// scripts/check-schema-drift.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Schema drift report between migration SQL files and the live Supabase DB.
//
// DEFAULT: concise summary to terminal + full detail to schema-drift-report.md
//
// What it detects:
//   • Tables in one side but not the other (views excluded — listed separately)
//   • Columns in migrations missing from DB
//   • Columns in DB with no ADD COLUMN in migrations (→ suggests backport SQL)
//   • CHECK constraints in DB that no migration names (extra)
//   • CHECK constraints whose name IS in migrations but whose value set differs
//     from what the migration defines — catches stale IN/ANY enum constraints
//     (e.g. auth_events_event_type_check missing new event types after §30.2)
//   • Triggers expected by migrations (CREATE TRIGGER) but absent from live DB
//   • Triggers in live DB not named in any migration
//   • Triggers present but DISABLED
//   • Functions pending deploy (informational, NOT drift): a function named in the
//     migrations (CREATE [OR REPLACE] FUNCTION) but not yet in the live public
//     schema. Migrations lead live pre-deploy, so this is reported as "pending" and
//     never fails the check — a lingering entry after a deploy means a migration that
//     never landed. Compared by NAME only; a body-level diff (local-replayed vs live
//     pg_get_functiondef) is unreliable across Postgres minor versions.
//   • Indexes in DB that no migration explicitly names
//   • RLS policies in DB that no migration explicitly names
//
// Known blind spots (not resolvable without full SQL parsing):
//   • Column attribute drift (nullability, type, default) for columns that
//     exist on both sides — the tool only checks column existence, not content.
//     For nullability specifically, look at ALTER COLUMN DROP/SET NOT NULL in
//     migrations and compare manually if suspect.
//
// Noise filters (aggressive by design):
//   • Auto-generated inline CHECK constraints ({table}_{col}_check where col is
//     present in migrations) are suppressed
//   • Auto-generated UNIQUE indexes ending in `_key` are suppressed (unless
//     --loose is passed)
//   • Primary key indexes ending in `_pkey` are suppressed
//   • Internal Postgres triggers (tgisinternal) are suppressed
//
// Credentials (from .env.local):
//   SUPABASE_PROJECT_ID    project ref (e.g. noexjtlrffkzzclibvbq)
//   SUPABASE_ACCESS_TOKEN  sbp_... from dashboard/account/tokens
//
// Usage:
//   node scripts/check-schema-drift.mjs                   # summary + md file
//   node scripts/check-schema-drift.mjs --stdout          # also print to stdout
//   node scripts/check-schema-drift.mjs --table=props     # filter one table
//   node scripts/check-schema-drift.mjs --out=path.md     # custom output
//   node scripts/check-schema-drift.mjs --no-color        # plain terminal
//   node scripts/check-schema-drift.mjs --loose           # keep _key indexes
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import * as dotenv from "dotenv"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, "..")
const MIGRATIONS_DIR = resolve(ROOT_DIR, "supabase/migrations")
dotenv.config({ path: resolve(ROOT_DIR, ".env.local") })

const PROJECT_REF = process.env.SUPABASE_PROJECT_ID
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error(
    "Missing SUPABASE_PROJECT_ID or SUPABASE_ACCESS_TOKEN in .env.local\n" +
    "Generate a token at https://supabase.com/dashboard/account/tokens"
  )
  process.exit(1)
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const tableFilter = args.find(a => a.startsWith("--table="))?.split("=")[1] ?? null
const outPath = args.find(a => a.startsWith("--out="))?.split("=")[1]
  ?? resolve(ROOT_DIR, "schema-drift-report.md")
const printFull = args.includes("--stdout")
const noColor = args.includes("--no-color") || !process.stdout.isTTY
const loose = args.includes("--loose")

// ── ANSI colours (terminal only) ──────────────────────────────────────────────
const C = noColor
  ? { reset: "", dim: "", red: "", green: "", yellow: "", cyan: "", bold: "" }
  : {
      reset: "\x1b[0m",
      dim:   "\x1b[2m",
      red:   "\x1b[31m",
      green: "\x1b[32m",
      yellow:"\x1b[33m",
      cyan:  "\x1b[36m",
      bold:  "\x1b[1m",
    }

// ── Load & parse migrations ───────────────────────────────────────────────────
function loadMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort()

  return files.map(name => {
    const content = readFileSync(join(MIGRATIONS_DIR, name), "utf8")
    return {
      name,
      content,
      searchable: content.replace(/--[^\n]*/g, "").toLowerCase(),
    }
  })
}

function parseMigrations(migrations) {
  /** @type {Map<string, { columns: Set<string>, origin: Set<string> }>} */
  const tables = new Map()

  function ensure(tname, origin) {
    if (!tables.has(tname)) tables.set(tname, { columns: new Set(), origin: new Set() })
    tables.get(tname).origin.add(origin)
    return tables.get(tname)
  }

  for (const mig of migrations) {
    const clean = mig.searchable.replace(/\s+/g, " ")

    // ── CREATE TABLE [IF NOT EXISTS] tname ( body ) ──
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([^;]+)\)/g
    let m
    while ((m = createRe.exec(clean)) !== null) {
      const entry = ensure(m[1], mig.name)
      for (const line of splitTopLevel(m[2])) {
        const t = line.trim()
        if (!t) continue
        if (/^constraint\s+/.test(t)) continue
        if (/^(unique|primary|check|foreign)\b/.test(t)) continue
        const col = /^(\w+)/.exec(t)
        if (col && !/^\d+$/.test(col[1])) entry.columns.add(col[1])
      }
    }

    // ── ALTER TABLE sections ──
    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)([^;]*);/g
    while ((m = alterRe.exec(clean)) !== null) {
      const tname = m[1]
      const section = m[2]
      const entry = ensure(tname, mig.name)

      const addColRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/g
      let cm
      while ((cm = addColRe.exec(section)) !== null) {
        if (!/^\d+$/.test(cm[1])) entry.columns.add(cm[1])
      }
    }
  }

  return tables
}

// ── Trigger + function parsers ────────────────────────────────────────────────

/**
 * Returns Map<tableName, Set<triggerName>> for all CREATE TRIGGER statements.
 * Matches: CREATE TRIGGER name BEFORE/AFTER/INSTEAD OF ... ON [public.]table
 */
function parseMigrationTriggers(migrations) {
  const byTable = new Map()
  for (const mig of migrations) {
    // Multiline-safe: match CREATE TRIGGER name up to ON tablename
    // {1,300}? prevents crossing trigger definition boundaries
    const re = /create\s+trigger\s+(\w+)[\s\S]{1,300}?\bon\s+(?:public\.)?(\w+)/gi
    let m
    while ((m = re.exec(mig.content)) !== null) {
      const tgname = m[1].toLowerCase()
      const tname  = m[2].toLowerCase()
      // Skip false-positives where ON is part of INSERT/UPDATE/DELETE clause
      // Real table names follow "FOR EACH" later — if tname is a DML keyword, skip
      if (/^(insert|update|delete|each|row|statement)$/.test(tname)) continue
      if (!byTable.has(tname)) byTable.set(tname, new Set())
      byTable.get(tname).add(tgname)
    }
  }
  return byTable
}

/**
 * Returns Set<functionName> for all CREATE [OR REPLACE] FUNCTION statements
 * in the public schema.
 */
function parseMigrationFunctions(migrations) {
  const names = new Set()
  for (const mig of migrations) {
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi
    let m
    while ((m = re.exec(mig.content)) !== null) {
      names.add(m[1].toLowerCase())
    }
  }
  return names
}

// ── CHECK value-set helpers ───────────────────────────────────────────────────

/** Extract all single-quoted string values from a CHECK definition. */
function extractQuotedValues(text) {
  const vals = new Set()
  const re = /'([^']+)'/g
  let m
  while ((m = re.exec(text)) !== null) vals.add(m[1])
  return vals
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

/**
 * Find the CHECK definition for a named constraint in the migration files
 * and return the set of single-quoted values inside it.
 * Returns null if the constraint definition cannot be located.
 */
function getMigrationCheckValues(constraintName, migrations) {
  const nameLower = constraintName.toLowerCase()

  // LAST DEFINITION WINS. Migrations replay top-to-bottom, so a later `DROP CONSTRAINT … ADD CONSTRAINT …`
  // SUPERSEDES an earlier one — which is how every widening in this repo is written, sometimes twice in the
  // SAME file. Returning the FIRST match read the superseded definition and reported drift that does not
  // exist: it claimed the file still allowed the eight `consent_*` auth event types, when 010 §30.2 had
  // silently dropped them 13 days after §25 added them. The file agreed with prod; the DETECTOR was wrong.
  //
  // (The real bug that finding sat on top of is worse, and this fix is what made it legible: the code writes
  // those event types and NEITHER the file NOR prod accepts them.)
  let last = null

  for (const mig of migrations) {
    // Search + extract BOTH against mig.content (indices must reference the same string — using the
    // comment-stripped `searchable` for the index but slicing `content` for the body mislocates the CHECK
    // by the stripped-comment length, landing on an unrelated constraint). Iterate every occurrence: the
    // DROP CONSTRAINT site yields no quoted values (or the wrong CHECK) and is skipped; the ADD CONSTRAINT
    // site carries the enum. Start the "check" search AFTER the name so its own `_check` suffix isn't matched.
    const contentLower = mig.content.toLowerCase()
    let from = 0
    for (;;) {
      const idx = contentLower.indexOf(nameLower, from)
      if (idx === -1) break
      const afterName = idx + nameLower.length
      from = afterName

      const window = contentLower.slice(afterName, afterName + 512)
      const checkIdx = window.indexOf("check")
      if (checkIdx === -1) continue

      let absStart = afterName + checkIdx
      while (absStart < mig.content.length && mig.content[absStart] !== "(") absStart++
      if (absStart >= mig.content.length) continue

      // Extract balanced parens
      let depth = 0
      let end = absStart
      for (let i = absStart; i < mig.content.length; i++) {
        if (mig.content[i] === "(")      depth++
        else if (mig.content[i] === ")") { depth--; if (depth === 0) { end = i; break } }
      }

      // Strip `--` comments before reading values. An apostrophe in ordinary English prose inside a comment —
      // "the landlord's consent (never the tenant's)" — parses as a quoted SQL literal, and the detector duly
      // reported `consent_log` as missing an allowed value of `'s consent (never the tenant'`. Prose is not a
      // constraint. (Second time today a comment has broken this parser; the first made it go silent.)
      const raw = mig.content.slice(absStart, end + 1).replaceAll(/--[^\n]*/g, "")
      const vals = extractQuotedValues(raw)
      if (vals.size > 0) last = vals            // keep going — a later definition supersedes this one
    }
  }
  return last
}

// Split a string on commas that are at depth 0 (ignoring commas inside parens).
function splitTopLevel(s) {
  const parts = []
  let depth = 0
  let buf = ""
  for (const ch of s) {
    if (ch === "(") depth++
    else if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      parts.push(buf)
      buf = ""
    } else {
      buf += ch
    }
  }
  if (buf) parts.push(buf)
  return parts
}

function findOrigin(name, migrations) {
  const lower = name.toLowerCase()
  return migrations.filter(m => m.searchable.includes(lower)).map(m => m.name)
}

// ── Query live DB ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function isRetryable(err) {
  const msg = String(err?.message ?? err)
  if (/HTTP 5\d\d/.test(msg)) return true
  if (/timeout/i.test(msg)) return true
  if (/Connection terminated/i.test(msg)) return true
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(msg)) return true
  return false
}

async function query(sql, { retries = 3 } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        }
      )
      const data = await res.json()
      if (!Array.isArray(data)) {
        if (res.status === 401) {
          throw new Error(
            "401 Unauthorized — the SUPABASE_ACCESS_TOKEN in .env.local is invalid or expired.\n" +
            "Generate a new one at https://supabase.com/dashboard/account/tokens"
          )
        }
        throw new Error(`Supabase API error (HTTP ${res.status}): ${JSON.stringify(data)}`)
      }
      return data
    } catch (err) {
      lastErr = err
      if (attempt > retries || !isRetryable(err)) throw err
      const backoffMs = 800 * attempt
      const snippet = String(err.message ?? err).slice(0, 80)
      process.stdout.write(`${C.dim}  ↪ retry ${attempt}/${retries} after ${backoffMs}ms (${snippet})${C.reset}\n`)
      await sleep(backoffMs)
    }
  }
  throw lastErr
}

async function getLiveSchema() {
  // Sequential — gentler on the Supabase management API under concurrent load.
  const tables = await query(`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `)
  const columns = await query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable,
           column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)
  const checks = await query(`
    SELECT conrelid::regclass::text AS table_name,
           conname AS constraint_name,
           pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE contype = 'c' AND connamespace = 'public'::regnamespace
    ORDER BY conrelid::regclass::text, conname
  `)
  const indexes = await query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `)
  const policies = await query(`
    SELECT tablename, policyname
    FROM pg_policies WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `)
  // Triggers: user-defined only (tgisinternal excludes system triggers like
  // deferred constraint triggers). Status: O=enabled, D=disabled.
  const triggers = await query(`
    SELECT tgname, relname AS table_name,
           CASE tgenabled
             WHEN 'O' THEN 'enabled'
             WHEN 'D' THEN 'disabled'
             ELSE tgenabled::text
           END AS status
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT tgisinternal
    ORDER BY relname, tgname
  `)
  // Functions in the public schema only (excludes pg_catalog builtins and
  // extension functions installed into other schemas).
  const functions = await query(`
    SELECT proname
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND prokind = 'f'
    ORDER BY proname
  `)
  // BODIES, not just names. A name tells you a function exists; only the body tells you what it CALLS — and a
  // live function calling a function the database does not have is a dead path, right now, in production.
  const functionDefs = await query(`
    SELECT proname, pg_get_functiondef(oid) AS def
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND prokind = 'f'
  `)
  return { tables, columns, checks, indexes, policies, triggers, functions, functionDefs }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function columnTypeString(col) {
  let type = col.data_type
  if (type === "ARRAY") type = `${col.udt_name.replace(/^_/, "")}[]`
  else if (type === "USER-DEFINED") type = col.udt_name
  else if (col.character_maximum_length) type += `(${col.character_maximum_length})`
  const nn = col.is_nullable === "NO" ? " NOT NULL" : ""
  const def = col.column_default ? ` DEFAULT ${col.column_default}` : ""
  return `${type}${nn}${def}`
}

/**
 * The allowed values of an INLINE `CHECK (col IN (...))` declared inside a CREATE TABLE.
 *
 * `getMigrationCheckValues` only finds constraints the migrations NAME (an explicit ADD CONSTRAINT). Most
 * CHECKs are not named — they are written inline and auto-named by Postgres — and those were skipped entirely.
 * That is the gap `contractors.supplier_type` lived in.
 */
function getInlineCheckValues(tableName, col, migrations) {
  // ANCHOR the table name immediately after CREATE TABLE. `CREATE TABLE[^;]*?\bunits\b` also matches
  // `CREATE TABLE leases ( … unit_id uuid REFERENCES units(id) … )` — landing on the LEASES body and reading
  // ITS `status` CHECK. That is how the first run accused `units_status_check` of admitting 'active', 'ended',
  // 'evicted': lease statuses, reported against the units table. Third instance of the same bleed today.
  const CREATE_RE = new RegExp(
    String.raw`CREATE TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?${tableName}\b`, "i",
  )
  // From the column's own declaration to the CHECK that belongs to it. Bounded, so a column with no CHECK of
  // its own cannot run on and swallow the NEXT column's — which would report a drift on the wrong column.
  const DECL_RE = new RegExp(String.raw`\n\s*${col}\s[\s\S]{0,300}?CHECK\s*\(([\s\S]{0,400}?)\)\s*[,\n]`, "i")

  for (const mig of migrations) {
    const create = CREATE_RE.exec(mig.content)
    if (!create) continue

    // BOUND THE SEARCH TO THIS TABLE'S BODY. Slicing to end-of-file lets the column pattern match a same-named
    // column in a LATER table — the first version reported `auth_events.event_type` as admitting 'queued',
    // 'sent', 'delivered', which are communication-delivery values from a different table entirely. The same
    // bleed I already fixed once today in the function reconciler. A detector's false positives are not a
    // cosmetic problem: they are the thing that gets the detector switched off.
    const rest = mig.content.slice(create.index)
    const endOfTable = rest.search(/\n\s*\);/)
    // Comments must not affect parsing. A `--` note between the column and its CHECK pushed them apart by more
    // than the match window, and the extractor silently found nothing — so the detector reported a clean bill
    // of health for the very constraint it was written to catch. (The comment that broke it was the one I wrote
    // in 005 explaining this drift.) A detector that goes quiet when it fails is the worst kind: it is
    // indistinguishable from a detector that passed.
    const body = (endOfTable === -1 ? rest : rest.slice(0, endOfTable)).replaceAll(/--[^\n]*/g, "")

    const decl = DECL_RE.exec(body)
    if (!decl) continue
    const vals = extractQuotedValues(decl[1])
    if (vals.size > 0) return vals
  }
  return null
}

function inlineCheckColumn(cname, tname) {
  if (!cname.startsWith(`${tname}_`)) return null
  if (!cname.endsWith("_check")) return null
  return cname.slice(tname.length + 1, -6)
}

// ── Main ──────────────────────────────────────────────────────────────────────
;(async () => {
  process.stdout.write(`${C.dim}Loading migrations…${C.reset}\n`)
  const migrations = loadMigrations()
  const expected = parseMigrations(migrations)
  const expectedTrigsByTable = parseMigrationTriggers(migrations)
  const expectedFunctions    = parseMigrationFunctions(migrations)

  process.stdout.write(`${C.dim}Querying live database…${C.reset}\n`)
  const live = await getLiveSchema()

  // Partition live tables/views
  const liveBaseTables = new Set()
  const liveViews = new Set()
  for (const t of live.tables) {
    if (t.table_type === "BASE TABLE") liveBaseTables.add(t.table_name)
    else if (t.table_type === "VIEW") liveViews.add(t.table_name)
  }

  // Index live schema by table
  const liveColsByTable = new Map()
  for (const c of live.columns) {
    if (!liveBaseTables.has(c.table_name)) continue
    if (!liveColsByTable.has(c.table_name)) liveColsByTable.set(c.table_name, new Map())
    liveColsByTable.get(c.table_name).set(c.column_name, c)
  }
  const liveChecksByTable = new Map()
  for (const c of live.checks) {
    if (!liveBaseTables.has(c.table_name)) continue
    if (!liveChecksByTable.has(c.table_name)) liveChecksByTable.set(c.table_name, new Map())
    liveChecksByTable.get(c.table_name).set(c.constraint_name, c)
  }
  const liveIdxByTable = new Map()
  for (const i of live.indexes) {
    if (!liveBaseTables.has(i.tablename)) continue
    if (!liveIdxByTable.has(i.tablename)) liveIdxByTable.set(i.tablename, new Map())
    liveIdxByTable.get(i.tablename).set(i.indexname, i)
  }
  const livePolByTable = new Map()
  for (const p of live.policies) {
    if (!liveBaseTables.has(p.tablename)) continue
    if (!livePolByTable.has(p.tablename)) livePolByTable.set(p.tablename, new Map())
    livePolByTable.get(p.tablename).set(p.policyname, p)
  }
  const liveTrigsByTable = new Map()
  for (const tg of live.triggers) {
    if (!liveTrigsByTable.has(tg.table_name)) liveTrigsByTable.set(tg.table_name, new Map())
    liveTrigsByTable.get(tg.table_name).set(tg.tgname, tg)
  }
  const liveFunctions = new Set(live.functions.map(f => f.proname.toLowerCase()))

  const allTableNames = new Set([...expected.keys(), ...liveBaseTables])

  // ── Drift detection ─────────────────────────────────────────────────────────
  /** @type {Map<string, Array<{kind:string, msg:string, detail?:string, fix?:string}>>} */
  const perTable = new Map()
  const counts = {
    missingTables: 0, extraTables: 0,
    colMissing: 0, colExtra: 0,
    checkStale: 0, checkExtra: 0,
    triggerMissing: 0, triggerExtra: 0, triggerDisabled: 0,
    idxExtra: 0, polExtra: 0,
  }

  function add(table, item) {
    if (!perTable.has(table)) perTable.set(table, [])
    perTable.get(table).push(item)
  }

  for (const t of allTableNames) {
    if (tableFilter && t !== tableFilter) continue

    const inMigrations = expected.has(t)
    const inDb = liveBaseTables.has(t)

    if (inMigrations && !inDb) {
      const origins = [...expected.get(t).origin].join(", ")
      add(t, { kind: "table-missing", msg: `Table expected in migrations (${origins}) but missing in DB` })
      counts.missingTables++
      continue
    }
    if (inDb && !inMigrations) {
      add(t, { kind: "table-extra", msg: `Table exists in DB but NOT in any migration` })
      counts.extraTables++
      continue
    }

    const expectedCols = expected.get(t).columns
    const liveCols = liveColsByTable.get(t) ?? new Map()

    for (const col of expectedCols) {
      if (!liveCols.has(col)) {
        add(t, { kind: "col-missing", msg: `Column **${col}** expected but missing in DB` })
        counts.colMissing++
      }
    }

    const extraColsHere = new Set()
    for (const [colname, coldata] of liveCols) {
      if (!expectedCols.has(colname)) {
        extraColsHere.add(colname)
        add(t, {
          kind: "col-extra",
          msg: `Column **${colname}** in DB but no ADD COLUMN in migrations`,
          detail: columnTypeString(coldata),
          fix: `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${colname} ${columnTypeString(coldata)};`,
        })
        counts.colExtra++
      }
    }

    // ── CHECK constraints ────────────────────────────────────────────────────
    const liveChecks = liveChecksByTable.get(t) ?? new Map()
    for (const [cname, cdata] of liveChecks) {
      const inferredCol = inlineCheckColumn(cname, t)
      // A LATER `ALTER TABLE … ADD CONSTRAINT <name> CHECK (…)` SUPERSEDES the inline one from CREATE TABLE —
      // that is how every widening in this repo is written (007 and 009 both do it). Comparing against the
      // inline declaration while a named ALTER redefines it downstream reports drift that does not exist: the
      // first version accused `consent_log_consent_type_check` of missing 'bank_details_import', which migration
      // 009 adds by name. So: if the migrations NAME the constraint anywhere, the named definition is the truth
      // and the inline path must not run.
      const isNamedInMigrations = findOrigin(cname, migrations).length > 0
      const isAutoInline = !isNamedInMigrations && inferredCol &&
        (expectedCols.has(inferredCol) || extraColsHere.has(inferredCol))

      // An auto-named inline CHECK ({table}_{col}_check) used to `continue` straight past EVERYTHING here —
      // including the value-set comparison below. That single line is how `contractors.supplier_type` came to
      // allow SIX values in production while the migration file declared THREE, for months, with this tool
      // printing "✓ No drift". The constraint NAME was noise; the VALUE SET never was.
      //
      // Suppress the "extra constraint" report (the name genuinely is auto-generated and uninteresting), but
      // still compare what the constraint ADMITS — which is the only thing about it that governs real rows.
      if (isAutoInline) {
        const liveVals = extractQuotedValues(cdata.definition)
        const migVals = liveVals.size > 0 ? getInlineCheckValues(t, inferredCol, migrations) : null
        if (migVals && migVals.size > 0 && !setsEqual(liveVals, migVals)) {
          const missingFromLive = [...migVals].filter((v) => !liveVals.has(v))
          const extraInLive = [...liveVals].filter((v) => !migVals.has(v))
          const parts = []
          if (extraInLive.length) {
            parts.push(`PROD-AHEAD (widened out-of-band, amend the file forward): ${extraInLive.map((v) => `'${v}'`).join(", ")}`)
          }
          if (missingFromLive.length) {
            parts.push(`FILE-AHEAD (declared but never deployed): ${missingFromLive.map((v) => `'${v}'`).join(", ")}`)
          }
          add(t, {
            kind: "check-stale",
            msg: `Inline CHECK **${cname}** admits different values in the file than in the database`,
            detail: parts.join(" · "),
          })
          counts.checkStale++
        }
        continue
      }

      const origins = findOrigin(cname, migrations)
      if (origins.length > 0) {
        // Constraint name is in migrations — compare value sets to detect stale content.
        // Only compare constraints that use IN/ANY value enumeration (extractQuotedValues
        // returns a non-empty set). Pure expression checks (e.g. col > 0) are skipped.
        const liveVals = extractQuotedValues(cdata.definition)
        if (liveVals.size > 0) {
          const migVals = getMigrationCheckValues(cname, migrations)
          if (migVals && !setsEqual(liveVals, migVals)) {
            const missingFromLive = [...migVals].filter(v => !liveVals.has(v))
            const extraInLive     = [...liveVals].filter(v => !migVals.has(v))
            const parts = []
            if (missingFromLive.length) parts.push(`missing from live: ${missingFromLive.map(v => `'${v}'`).join(", ")}`)
            if (extraInLive.length)     parts.push(`extra in live: ${extraInLive.map(v => `'${v}'`).join(", ")}`)
            add(t, {
              kind: "check-stale",
              msg: `CHECK **${cname}** content differs from migration definition`,
              detail: parts.join(" | "),
            })
            counts.checkStale++
          }
        }
        continue
      }

      add(t, {
        kind: "check-extra",
        msg: `CHECK **${cname}** in DB but name not in migrations`,
        detail: cdata.definition,
        fix: `ALTER TABLE ${t} ADD CONSTRAINT ${cname} ${cdata.definition};`,
      })
      counts.checkExtra++
    }

    // ── Indexes ──────────────────────────────────────────────────────────────
    const liveIdx = liveIdxByTable.get(t) ?? new Map()
    for (const [iname, idata] of liveIdx) {
      if (iname.endsWith("_pkey")) continue
      if (!loose && iname.endsWith("_key")) continue
      if (findOrigin(iname, migrations).length > 0) continue

      add(t, {
        kind: "idx-extra",
        msg: `Index **${iname}** in DB but name not in migrations`,
        detail: idata.indexdef,
        fix: `${idata.indexdef};`,
      })
      counts.idxExtra++
    }

    // ── Policies ─────────────────────────────────────────────────────────────
    const livePol = livePolByTable.get(t) ?? new Map()
    for (const [pname] of livePol) {
      if (findOrigin(pname, migrations).length > 0) continue
      add(t, { kind: "pol-extra", msg: `Policy **${pname}** in DB but name not in migrations` })
      counts.polExtra++
    }

    // ── Triggers ─────────────────────────────────────────────────────────────
    const liveTriggers    = liveTrigsByTable.get(t) ?? new Map()
    const expectedTrigers = expectedTrigsByTable.get(t) ?? new Set()

    for (const tgname of expectedTrigers) {
      if (!liveTriggers.has(tgname)) {
        add(t, { kind: "trigger-missing", msg: `Trigger **${tgname}** expected in migrations but missing from DB` })
        counts.triggerMissing++
      }
    }
    for (const [tgname, tgdata] of liveTriggers) {
      if (!expectedTrigers.has(tgname) && findOrigin(tgname, migrations).length === 0) {
        add(t, { kind: "trigger-extra", msg: `Trigger **${tgname}** in DB but not named in migrations` })
        counts.triggerExtra++
      }
      if (tgdata.status === "disabled") {
        add(t, { kind: "trigger-disabled", msg: `Trigger **${tgname}** is DISABLED in DB` })
        counts.triggerDisabled++
      }
    }
  }

  // ── Function changes (global) — reported as "pending deploy", NOT counted as failing drift ──
  // A function named in the migrations but not yet in live (new, e.g. allocate_payment_atomic /
  // disburse_deposit_atomic) is PENDING a deploy, not ad-hoc drift — migrations lead live before a
  // deploy. We surface it so a forgotten deploy stays visible without making unmerged/undeployed work
  // read as a failure. Compared by NAME only: a body-level diff (local-replayed vs live
  // pg_get_functiondef) was tried but is unreliable across Postgres MINOR versions — the canonical
  // formatting of SECURITY DEFINER / SET search_path clauses differs, producing false positives.
  const pendingFunctions = [] // { name, reason }
  for (const fname of expectedFunctions) {
    if (!liveFunctions.has(fname)) pendingFunctions.push({ name: fname, reason: "in migrations, not yet in live" })
  }
  pendingFunctions.sort((a, b) => a.name.localeCompare(b.name))

  // ── A pending function that a LIVE function CALLS is not "pending". It is BROKEN IN PRODUCTION. ──────
  //
  // "Migrations lead live before a deploy" is true, and it is exactly why this was left informational — with
  // `allocate_payment_atomic` NAMED in the comment above as the benign example. It was not benign. It has been
  // "pending" for months, and `settle_deposit_charge_pattern_a_atomic` — which IS deployed — PERFORMs it, so
  // every real Pattern-A settlement raises "function does not exist". A forgotten deploy stayed visible, and
  // being visible turned out to be worth nothing, because nothing ever failed.
  //
  // The distinction that matters is not "is it deployed yet" but "does anything LIVE depend on it". If a live
  // function calls a function the database does not have, that path is dead NOW, and it is drift, not a plan.
  const brokenInProd = []
  for (const p of pendingFunctions) {
    const callers = (live.functionDefs ?? [])
      .filter((f) => new RegExp(String.raw`\b${p.name}\s*\(`, "i").test(f.def))
      .map((f) => f.proname)
    if (callers.length) brokenInProd.push({ name: p.name, callers })
  }
  for (const b of brokenInProd) {
    add("(functions)", {
      kind: "fn-broken",
      msg: `Live function(s) **${b.callers.join(", ")}** call **${b.name}()**, which is NOT in the database`,
      detail: `Every invocation raises "function does not exist". FILE-AHEAD: deploy ${b.name}, do not delete it.`,
    })
    counts.fnBroken = (counts.fnBroken ?? 0) + 1
  }

  const totalDrift = Object.values(counts).reduce((s, n) => s + n, 0)
  const tablesWithDrift = perTable.size

  // ── Build markdown report ───────────────────────────────────────────────────
  const md = []
  md.push(`# Schema drift report`)
  md.push("")
  md.push(`- **Project:** \`${PROJECT_REF}\``)
  md.push(`- **Generated:** ${new Date().toISOString()}`)
  if (tableFilter) md.push(`- **Filter:** table = \`${tableFilter}\``)
  md.push(`- **Migrations:** ${migrations.length} files · ${expected.size} tables referenced`)
  md.push(`- **Live DB:** ${liveBaseTables.size} tables · ${liveViews.size} views`)
  if (loose) md.push(`- **Mode:** loose (auto-generated \`_key\` indexes included)`)
  md.push("")

  md.push(`## Summary`)
  md.push("")
  md.push(`| Category | Count |`)
  md.push(`|---|---|`)
  md.push(`| Tables in migrations but missing in DB | ${counts.missingTables} |`)
  md.push(`| Tables in DB but not in migrations | ${counts.extraTables} |`)
  md.push(`| Columns missing in DB | ${counts.colMissing} |`)
  md.push(`| Columns extra in DB (ad-hoc) | ${counts.colExtra} |`)
  md.push(`| CHECK constraints stale (name matches, content differs) | ${counts.checkStale} |`)
  md.push(`| CHECK constraints extra in DB | ${counts.checkExtra} |`)
  md.push(`| Triggers missing from DB | ${counts.triggerMissing} |`)
  md.push(`| Triggers extra in DB | ${counts.triggerExtra} |`)
  md.push(`| Triggers disabled | ${counts.triggerDisabled} |`)
  md.push(`| Indexes extra in DB | ${counts.idxExtra} |`)
  md.push(`| Policies extra in DB | ${counts.polExtra} |`)
  md.push(`| **Total drift items** | **${totalDrift}** |`)
  md.push(`| Functions pending deploy (informational) | ${pendingFunctions.length} |`)
  md.push(`| Tables affected | ${tablesWithDrift} |`)
  md.push("")

  if (liveViews.size > 0) {
    md.push(`## Views in DB`)
    md.push("")
    md.push(`These are views, not base tables — not tracked for drift.`)
    md.push("")
    for (const v of [...liveViews].sort()) md.push(`- \`${v}\``)
    md.push("")
  }

  if (totalDrift === 0) {
    md.push(`✅ **No drift detected — migrations match the live database.**`)
  } else {
    if (perTable.size > 0) {
      md.push(`## Per-table detail`)
      md.push("")
      md.push(`Legend:`)
      md.push(`- ❌ expected in migrations but missing in DB`)
      md.push(`- ⚠️ exists in DB but no migration introduces it (likely ad-hoc SQL)`)
      md.push(`- 🔄 name matches a migration but content differs`)
      md.push("")

      const sortedTables = [...perTable.keys()].sort()
      for (const t of sortedTables) {
        const items = perTable.get(t)
        md.push(`### \`${t}\``)
        md.push("")

        for (const item of items) {
          const icon =
            item.kind.includes("missing") ? "❌" :
            item.kind.includes("stale")   ? "🔄" :
            item.kind === "trigger-disabled" ? "⚠️" :
            "⚠️"
          md.push(`${icon} ${item.msg}`)
          if (item.detail) md.push(`  > ${item.detail}`)
          if (item.fix) {
            md.push("")
            md.push(`  \`\`\`sql`)
            md.push(`  ${item.fix}`)
            md.push(`  \`\`\``)
          }
          md.push("")
        }
      }
    }

    if ([...perTable.values()].some(items => items.some(i => i.fix))) {
      md.push(`## Backport all (copy-paste ready)`)
      md.push("")
      md.push(`Every suggested fix concatenated. Paste into a migration file to bring live DB back in sync:`)
      md.push("")
      md.push("```sql")
      for (const [t, items] of [...perTable.entries()].sort()) {
        const fixes = items.filter(i => i.fix)
        if (fixes.length === 0) continue
        md.push(`-- ── ${t} ──`)
        for (const item of fixes) md.push(item.fix)
        md.push("")
      }
      md.push("```")
    }
  }

  if (pendingFunctions.length > 0) {
    md.push(`## Functions pending deploy`)
    md.push("")
    md.push(`_Informational — NOT counted as drift. Compared by name (a body-level diff is unreliable across Postgres minor versions)._`)
    md.push("")
    md.push(`These functions differ between the migrations and live because the migration hasn't been`)
    md.push(`applied to prod yet — a new function or a changed body. They resolve on deploy; a lingering`)
    md.push(`entry after a deploy means a migration that never landed.`)
    md.push("")
    for (const f of pendingFunctions) md.push(`- ⏳ \`${f.name}\` — ${f.reason}`)
    md.push("")
  }

  writeFileSync(outPath, md.join("\n") + "\n", "utf8")

  // ── Terminal summary ────────────────────────────────────────────────────────
  console.log()
  console.log(`${C.bold}Schema drift summary${C.reset}`)
  console.log(`  ${C.dim}Project ${PROJECT_REF}${C.reset}`)
  console.log()

  if (totalDrift === 0) {
    console.log(`  ${C.green}✓ No drift — migrations match the live database.${C.reset}`)
    if (pendingFunctions.length > 0) {
      console.log(`  ${C.yellow}⏳ ${pendingFunctions.length} function(s) pending deploy${C.reset} ${C.dim}(informational — see report)${C.reset}`)
    }
    if (liveViews.size > 0) {
      console.log(`  ${C.dim}(${liveViews.size} views in DB — not tracked for drift)${C.reset}`)
    }
    console.log()
    return
  }

  const row = (label, n, colour) => {
    const c = n === 0 ? C.dim : colour
    console.log(`  ${c}${String(n).padStart(4)}${C.reset}  ${label}`)
  }
  row("tables in migrations, missing in DB",          counts.missingTables,   C.red)
  row("tables in DB, not in any migration",           counts.extraTables,     C.yellow)
  row("columns missing in DB",                        counts.colMissing,      C.red)
  row("columns extra in DB (ad-hoc)",                 counts.colExtra,        C.yellow)
  row("CHECK constraints stale (content differs)",    counts.checkStale,      C.red)
  row("CHECK constraints extra in DB",                counts.checkExtra,      C.yellow)
  row("triggers missing from DB",                     counts.triggerMissing,  C.red)
  row("triggers extra in DB",                         counts.triggerExtra,    C.yellow)
  row("triggers disabled",                            counts.triggerDisabled, C.yellow)
  row("indexes extra in DB",                          counts.idxExtra,        C.yellow)
  row("RLS policies extra in DB",                     counts.polExtra,        C.yellow)
  console.log()

  const grandTotal = totalDrift
  console.log(`  ${C.bold}${grandTotal}${C.reset} total drift items across ${C.bold}${tablesWithDrift}${C.reset} tables`)
  if (pendingFunctions.length > 0) {
    console.log(`  ${C.yellow}⏳ ${pendingFunctions.length} function(s) pending deploy${C.reset} ${C.dim}(informational)${C.reset}`)
  }
  if (liveViews.size > 0) {
    console.log(`  ${C.dim}${liveViews.size} views in DB (not tracked)${C.reset}`)
  }
  console.log()

  const tableCounts = [...perTable.entries()]
    .map(([t, items]) => [t, items.length])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  if (tableCounts.length > 0) {
    console.log(`  ${C.dim}Most affected tables:${C.reset}`)
    for (const [t, n] of tableCounts) {
      console.log(`    ${C.cyan}${t}${C.reset} ${C.dim}(${n} item${n === 1 ? "" : "s"})${C.reset}`)
    }
    console.log()
  }

  const relPath = outPath.replace(ROOT_DIR + (process.platform === "win32" ? "\\" : "/"), "")
  console.log(`  📄 Full report written to ${C.cyan}${relPath}${C.reset}`)
  console.log(`     ${C.dim}Open in VS Code to review with syntax highlighting.${C.reset}`)
  console.log()

  if (printFull) {
    console.log(`${C.dim}── full output below (--stdout) ──${C.reset}`)
    console.log()
    console.log(md.join("\n"))
  } else {
    console.log(`  ${C.dim}Tip: ${C.reset}--stdout${C.dim} to print full report, ${C.reset}--table=<n>${C.dim} to filter, ${C.reset}--loose${C.dim} to include _key indexes.${C.reset}`)
    console.log()
  }
})()
