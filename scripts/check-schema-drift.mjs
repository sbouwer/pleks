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
//   • CHECK constraints in DB that no migration explicitly names
//   • Indexes in DB that no migration explicitly names
//   • RLS policies in DB that no migration explicitly names
//
// Noise filters (aggressive by design):
//   • Auto-generated inline CHECK constraints ({table}_{col}_check where col is
//     present in migrations) are suppressed — they come from inline CHECK in
//     CREATE TABLE or ALTER TABLE ADD COLUMN
//   • Auto-generated UNIQUE indexes ending in `_key` are suppressed — they
//     come from inline UNIQUE constraints
//   • Primary key indexes ending in `_pkey` are suppressed
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
    // normalise whitespace for pattern matching
    const clean = mig.searchable.replace(/\s+/g, " ")

    // ── CREATE TABLE [IF NOT EXISTS] tname ( body ) ──
    // Body extraction handles nested parens via greedy-backtrack on final `)`
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([^;]+)\)/g
    let m
    while ((m = createRe.exec(clean)) !== null) {
      const entry = ensure(m[1], mig.name)
      // Split on commas — inline CHECK bodies may contain commas but
      // our column-name extraction only reads the first \w+ token of each
      // chunk, which is still correct as long as CHECK doesn't start a chunk.
      // We already filter CHECK/CONSTRAINT/UNIQUE/PRIMARY/FOREIGN as the
      // first token so stray commas inside CHECK only create noise that
      // gets filtered naturally.
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
    // Grab every "alter table <t> ... ;" section, then scan the whole
    // section for ADD COLUMN occurrences. This handles inline CHECK
    // constraints with commas inside (IN ('a', 'b')) without breaking.
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

// Errors worth retrying: transient timeouts, 5xx, connection drops.
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
          // Auth error — don't retry
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
      const backoffMs = 800 * attempt  // 800ms, 1600ms, 2400ms
      const snippet = String(err.message ?? err).slice(0, 80)
      process.stdout.write(`${C.dim}  ↪ retry ${attempt}/${retries} after ${backoffMs}ms (${snippet})${C.reset}\n`)
      await sleep(backoffMs)
    }
  }
  throw lastErr
}

async function getLiveSchema() {
  // Sequential (not Promise.all) — gentler on the Supabase management API,
  // which is noticeably flakier under concurrent load. Still sub-second total.
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
  return { tables, columns, checks, indexes, policies }
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

// Given a constraint name like "foo_bar_baz_check" and table "foo", return
// the inferred column name "bar_baz" if it matches the auto-generated pattern,
// otherwise null.
function inlineCheckColumn(cname, tname) {
  if (!cname.startsWith(`${tname}_`)) return null
  if (!cname.endsWith("_check")) return null
  return cname.slice(tname.length + 1, -6)  // strip "{t}_" and "_check"
}

// ── Main ──────────────────────────────────────────────────────────────────────
;(async () => {
  process.stdout.write(`${C.dim}Loading migrations…${C.reset}\n`)
  const migrations = loadMigrations()
  const expected = parseMigrations(migrations)

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
    if (!liveBaseTables.has(c.table_name)) continue  // skip views
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

  const allTableNames = new Set([...expected.keys(), ...liveBaseTables])

  // ── Drift detection ─────────────────────────────────────────────────────────
  /** @type {Map<string, Array<{kind:string, msg:string, detail?:string, fix?:string}>>} */
  const perTable = new Map()
  const counts = {
    missingTables: 0, extraTables: 0,
    colMissing: 0, colExtra: 0,
    checkExtra: 0, idxExtra: 0, polExtra: 0,
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

    // Track extra columns so we can suppress their auto-generated inline CHECKs
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

    const liveChecks = liveChecksByTable.get(t) ?? new Map()
    for (const [cname, cdata] of liveChecks) {
      // Skip auto-generated inline CHECKs whose column is known (in migrations OR
      // already flagged as a drift column — in which case its backport will
      // include the CHECK via the column ALTER)
      const inferredCol = inlineCheckColumn(cname, t)
      if (inferredCol && (expectedCols.has(inferredCol) || extraColsHere.has(inferredCol))) continue
      // Skip if the constraint name appears verbatim in any migration
      if (findOrigin(cname, migrations).length > 0) continue

      add(t, {
        kind: "check-extra",
        msg: `CHECK **${cname}** in DB but name not in migrations`,
        detail: cdata.definition,
        fix: `ALTER TABLE ${t} ADD CONSTRAINT ${cname} ${cdata.definition};`,
      })
      counts.checkExtra++
    }

    const liveIdx = liveIdxByTable.get(t) ?? new Map()
    for (const [iname, idata] of liveIdx) {
      if (iname.endsWith("_pkey")) continue
      // _key suffix indicates auto-generated UNIQUE constraint index — always skip
      // unless --loose is passed
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

    const livePol = livePolByTable.get(t) ?? new Map()
    for (const [pname] of livePol) {
      if (findOrigin(pname, migrations).length > 0) continue
      add(t, { kind: "pol-extra", msg: `Policy **${pname}** in DB but name not in migrations` })
      counts.polExtra++
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
  md.push(`| CHECK constraints extra in DB | ${counts.checkExtra} |`)
  md.push(`| Indexes extra in DB | ${counts.idxExtra} |`)
  md.push(`| Policies extra in DB | ${counts.polExtra} |`)
  md.push(`| **Total drift items** | **${totalDrift}** |`)
  md.push(`| Tables affected | ${tablesWithDrift} |`)
  md.push("")

  if (liveViews.size > 0) {
    md.push(`## Views in DB`)
    md.push("")
    md.push(`These are views, not base tables — not tracked for drift.`)
    md.push("")
    for (const v of [...liveViews].sort()) {
      md.push(`- \`${v}\``)
    }
    md.push("")
  }

  if (totalDrift === 0) {
    md.push(`✅ **No drift detected — migrations match the live database.**`)
  } else {
    md.push(`## Per-table detail`)
    md.push("")
    md.push(`Legend:`)
    md.push(`- ❌ expected in migrations but missing in DB`)
    md.push(`- ⚠️ exists in DB but no migration introduces it (likely ad-hoc SQL)`)
    md.push("")

    const sortedTables = [...perTable.keys()].sort()
    for (const t of sortedTables) {
      const items = perTable.get(t)
      md.push(`### \`${t}\``)
      md.push("")

      for (const item of items) {
        const icon = item.kind.includes("missing") ? "❌" : "⚠️"
        md.push(`${icon} ${item.msg}`)
        if (item.detail) md.push(`  > \`${item.detail}\``)
        if (item.fix) {
          md.push("")
          md.push(`  \`\`\`sql`)
          md.push(`  ${item.fix}`)
          md.push(`  \`\`\``)
        }
        md.push("")
      }
    }

    md.push(`## Backport all (copy-paste ready)`)
    md.push("")
    md.push(`Every suggested fix concatenated. Paste into a new migration file to bring migrations back in sync with the live DB:`)
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

  writeFileSync(outPath, md.join("\n") + "\n", "utf8")

  // ── Terminal summary ────────────────────────────────────────────────────────
  console.log()
  console.log(`${C.bold}Schema drift summary${C.reset}`)
  console.log(`  ${C.dim}Project ${PROJECT_REF}${C.reset}`)
  console.log()

  if (totalDrift === 0) {
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
  row("tables in migrations, missing in DB", counts.missingTables, C.red)
  row("tables in DB, not in any migration",  counts.extraTables,   C.yellow)
  row("columns missing in DB",                counts.colMissing,    C.red)
  row("columns extra in DB (ad-hoc)",         counts.colExtra,      C.yellow)
  row("CHECK constraints extra in DB",        counts.checkExtra,    C.yellow)
  row("indexes extra in DB",                  counts.idxExtra,      C.yellow)
  row("RLS policies extra in DB",             counts.polExtra,      C.yellow)
  console.log()
  console.log(`  ${C.bold}${totalDrift}${C.reset} total drift items across ${C.bold}${tablesWithDrift}${C.reset} tables`)
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
