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
//   • Functions named in migrations (CREATE [OR REPLACE] FUNCTION) but absent
//     from the live public schema
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
  for (const mig of migrations) {
    const lower = mig.searchable  // already lowercased + comments stripped
    const idx = lower.indexOf(nameLower)
    if (idx === -1) continue

    // Find the opening paren of CHECK ( after the constraint name, within 512 chars
    const window = lower.slice(idx, idx + 512)
    const checkIdx = window.indexOf("check")
    if (checkIdx === -1) continue

    // Walk forward from the CHECK keyword in the original content to find opening paren
    let absStart = idx + checkIdx
    while (absStart < mig.content.length && mig.content[absStart] !== "(") absStart++
    if (absStart >= mig.content.length) continue

    // Extract balanced parens
    let depth = 0
    let end = absStart
    for (let i = absStart; i < mig.content.length; i++) {
      if (mig.content[i] === "(")      depth++
      else if (mig.content[i] === ")") { depth--; if (depth === 0) { end = i; break } }
    }

    const vals = extractQuotedValues(mig.content.slice(absStart, end + 1))
    if (vals.size > 0) return vals
  }
  return null
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
  return { tables, columns, checks, indexes, policies, triggers, functions }
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
    functionMissing: 0,
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
      if (inferredCol && (expectedCols.has(inferredCol) || extraColsHere.has(inferredCol))) continue

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

  // ── Function drift (global — not per-table) ─────────────────────────────────
  const functionIssues = []
  for (const fname of expectedFunctions) {
    if (!liveFunctions.has(fname)) {
      functionIssues.push(fname)
      counts.functionMissing++
    }
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
  md.push(`| Functions missing from DB | ${counts.functionMissing} |`)
  md.push(`| **Total drift items** | **${totalDrift}** |`)
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

  if (totalDrift === 0 && functionIssues.length === 0) {
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

    if (functionIssues.length > 0) {
      md.push(`## Function drift`)
      md.push("")
      md.push(`Functions named in migrations but absent from the live public schema:`)
      md.push("")
      for (const fname of functionIssues.sort()) {
        md.push(`- ❌ \`${fname}\``)
      }
      md.push("")
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

  writeFileSync(outPath, md.join("\n") + "\n", "utf8")

  // ── Terminal summary ────────────────────────────────────────────────────────
  console.log()
  console.log(`${C.bold}Schema drift summary${C.reset}`)
  console.log(`  ${C.dim}Project ${PROJECT_REF}${C.reset}`)
  console.log()

  if (totalDrift === 0 && functionIssues.length === 0) {
    console.log(`  ${C.green}✓ No drift — migrations match the live database.${C.reset}`)
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
  row("functions missing from DB",                    counts.functionMissing, C.red)
  console.log()

  const grandTotal = totalDrift
  console.log(`  ${C.bold}${grandTotal}${C.reset} total drift items across ${C.bold}${tablesWithDrift}${C.reset} tables`)
  if (functionIssues.length > 0) {
    console.log(`  ${C.red}+ ${functionIssues.length} function(s) missing from live DB${C.reset}`)
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
