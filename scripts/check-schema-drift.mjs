#!/usr/bin/env node
// Usage: node scripts/check-schema-drift.mjs
// Compares columns/constraints defined in migration SQL files against the live
// Supabase database and prints ONLY differences.

import { readFileSync, readdirSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, "../supabase/migrations")

const PROJECT_REF = "noexjtlrffkzzclibvbq"
const ACCESS_TOKEN = "sbp_6d7028f82bcfdbf62cc196c0847f90172de32f3d"

// ---------------------------------------------------------------------------
// 1. Parse migration files → expected schema
// ---------------------------------------------------------------------------
function parseMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  /** @type {Map<string, Set<string>>} table → column names */
  const tables = new Map()
  /** @type {Map<string, Set<string>>} table → constraint names */
  const constraints = new Map()

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
    // Normalise: strip comments, collapse whitespace
    const clean = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase()

    // --- CREATE TABLE [IF NOT EXISTS] tablename ( ... ) ---
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([^;]+)\)/g
    let m
    while ((m = createRe.exec(clean)) !== null) {
      const tname = m[1]
      const body = m[2]
      if (!tables.has(tname)) tables.set(tname, new Set())
      if (!constraints.has(tname)) constraints.set(tname, new Set())

      // Extract column names — lines that start with a word (col def) or CONSTRAINT
      for (const line of body.split(",")) {
        const t = line.trim()
        if (!t) continue
        // CONSTRAINT name ...
        const cMatch = /constraint\s+(\w+)/.exec(t)
        if (cMatch) { constraints.get(tname).add(cMatch[1]); continue }
        // Skip table-level keywords: UNIQUE, PRIMARY KEY, CHECK, FOREIGN KEY
        if (/^(unique|primary|check|foreign)\b/.test(t)) continue
        // Column name is first token
        const colMatch = /^(\w+)/.exec(t)
        if (colMatch && !/^\d+$/.test(colMatch[1])) tables.get(tname).add(colMatch[1])
      }
    }

    // --- ALTER TABLE tablename ADD COLUMN [IF NOT EXISTS] colname ---
    // Also handles chained: ALTER TABLE t ADD COLUMN a …, ADD COLUMN b …
    // eslint-disable-next-line sonarjs/slow-regex -- dev-only script; pattern complexity needed to match chained ADD COLUMN in a single pass
    const addColRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)((?:\s+add\s+column\s+(?:if\s+not\s+exists\s+)?\w[^,;]*[,;]?)+)/g
    while ((m = addColRe.exec(clean)) !== null) {
      const tname = m[1]
      if (!tables.has(tname)) tables.set(tname, new Set())
      const chainRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/g
      let cm
      while ((cm = chainRe.exec(m[2])) !== null) {
        const col = cm[1]
        if (/^\d+$/.test(col)) continue  // skip numeric tokens (parser artefact)
        tables.get(tname).add(col)
      }
    }

    // --- ALTER TABLE tablename ADD CONSTRAINT name ---
    const addConRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+add\s+constraint\s+(\w+)/g
    while ((m = addConRe.exec(clean)) !== null) {
      const tname = m[1]
      const cname = m[2]
      if (!constraints.has(tname)) constraints.set(tname, new Set())
      constraints.get(tname).add(cname)
    }

    // DROP CONSTRAINT IF EXISTS — skip tracking, used only as idempotency guard
  }

  return { tables, constraints }
}

// ---------------------------------------------------------------------------
// 2. Query live database
// ---------------------------------------------------------------------------
async function query(sql) {
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
  if (!Array.isArray(data)) throw new Error(JSON.stringify(data))
  return data
}

async function getLiveSchema() {
  const colRows = await query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)

  const conRows = await query(`
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'CHECK'
      AND tc.constraint_name NOT LIKE '%not_null%'
    ORDER BY tc.table_name, tc.constraint_name
  `)

  const tableRows = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)

  /** @type {Map<string, Set<string>>} */
  const liveTables = new Map()
  for (const r of colRows) {
    if (!liveTables.has(r.table_name)) liveTables.set(r.table_name, new Set())
    liveTables.get(r.table_name).add(r.column_name)
  }

  /** @type {Map<string, Set<string>>} */
  const liveConstraints = new Map()
  for (const r of conRows) {
    if (!liveConstraints.has(r.table_name)) liveConstraints.set(r.table_name, new Set())
    liveConstraints.get(r.table_name).add(r.constraint_name)
  }

  /** @type {Set<string>} */
  const tableNames = new Set(tableRows.map((r) => r.table_name))

  return { liveTables, liveConstraints, tableNames }
}

// ---------------------------------------------------------------------------
// 3. Diff and report
// ---------------------------------------------------------------------------
function diff(migTables, migConstraints, liveTables, liveConstraints, liveTableNames) {
  const issues = {
    "TABLE MISSING FROM MIGRATIONS": [],
    "TABLE IN MIGRATIONS BUT NOT IN DB": [],
    "COLUMN IN MIGRATIONS BUT MISSING IN DB": [],
    "COLUMN IN DB BUT NOT IN MIGRATIONS": [],
    "CONSTRAINT IN MIGRATIONS BUT MISSING IN DB": [],
    "CONSTRAINT IN DB BUT NOT IN MIGRATIONS": [],
  }

  const migTableNames = new Set(migTables.keys())

  for (const t of liveTableNames) {
    if (!migTableNames.has(t)) issues["TABLE MISSING FROM MIGRATIONS"].push(t)
  }
  for (const t of migTableNames) {
    if (!liveTableNames.has(t)) issues["TABLE IN MIGRATIONS BUT NOT IN DB"].push(t)
  }

  for (const [tname, migCols] of migTables) {
    if (!liveTableNames.has(tname)) continue
    const liveCols = liveTables.get(tname) ?? new Set()

    for (const col of migCols) {
      if (!liveCols.has(col)) issues["COLUMN IN MIGRATIONS BUT MISSING IN DB"].push(`${tname}.${col}`)
    }
    for (const col of liveCols) {
      if (!migCols.has(col)) issues["COLUMN IN DB BUT NOT IN MIGRATIONS"].push(`${tname}.${col}`)
    }
  }

  for (const [tname, migCons] of migConstraints) {
    if (!liveTableNames.has(tname)) continue
    const liveCons = liveConstraints.get(tname) ?? new Set()
    for (const cname of migCons) {
      if (!liveCons.has(cname)) issues["CONSTRAINT IN MIGRATIONS BUT MISSING IN DB"].push(`${tname}.${cname}`)
    }
  }
  for (const [tname, liveCons] of liveConstraints) {
    const migCons = migConstraints.get(tname) ?? new Set()
    for (const cname of liveCons) {
      if (!migCons.has(cname)) issues["CONSTRAINT IN DB BUT NOT IN MIGRATIONS"].push(`${tname}.${cname}`)
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------
;(async () => {
  process.stdout.write("Parsing migration files…\n")
  const { tables: migTables, constraints: migConstraints } = parseMigrations()
  process.stdout.write(`  ${migTables.size} tables in migrations\n`)

  process.stdout.write("Querying live database…\n")
  const { liveTables, liveConstraints, tableNames } = await getLiveSchema()
  process.stdout.write(`  ${tableNames.size} tables in DB\n\n`)

  const issues = diff(migTables, migConstraints, liveTables, liveConstraints, tableNames)
  const total = Object.values(issues).reduce((s, a) => s + a.length, 0)

  if (total === 0) {
    console.log("✓ No drift detected — migrations match the live database.")
    return
  }

  for (const [category, items] of Object.entries(issues)) {
    if (items.length === 0) continue
    console.log(`\n── ${category} (${items.length}) ──`)
    for (const item of items.sort()) console.log(`  • ${item}`)
  }

  console.log(`\n${total} total issue(s) found.`)
})()
