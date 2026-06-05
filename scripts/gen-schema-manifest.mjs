// scripts/gen-schema-manifest.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Regenerates scripts/schema-manifest.json — the committed schema contract that
// scripts/schema-contract-scan.mjs validates every DB call against
// (ADDENDUM_SCHEMA_CONTRACT_SCREEN). Supersedes gen-schema-columns.mjs.
//
//   { tables: { name: [cols] },        // tables + VIEWS (information_schema.columns)
//     rpcs:   { name: [argNames] } }   // public FUNCTIONs + their IN/INOUT arg names
//
// MACHINE-GENERATED ON PURPOSE — never hand-edit (a hand-edit could carry the very
// transcription error we guard against). Source of truth = the live DB. Same
// Management-API connection as check-schema-drift.mjs. Regenerate when migrations
// change a table/view/function shape (gated by check-drift-if-sql-changed.mjs).
//
// USAGE:  node scripts/gen-schema-manifest.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, "..")
const OUT_PATH = resolve(__dirname, "schema-manifest.json")
dotenv.config({ path: resolve(ROOT_DIR, ".env.local") })

const PROJECT_REF = process.env.SUPABASE_PROJECT_ID
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error("Missing SUPABASE_PROJECT_ID or SUPABASE_ACCESS_TOKEN in .env.local")
  process.exit(1)
}

async function runQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  })
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`Supabase API error (HTTP ${res.status}): ${JSON.stringify(data)}`)
  return data
}

const COLS_SQL = `
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;`

// IN/INOUT parameter names for public FUNCTIONs (PostgREST .rpc() passes these by name).
const RPC_SQL = `
  SELECT r.routine_name, p.parameter_name
  FROM information_schema.routines r
  LEFT JOIN information_schema.parameters p
    ON p.specific_name = r.specific_name AND p.parameter_mode IN ('IN', 'INOUT')
  WHERE r.routine_schema = 'public' AND r.routine_type = 'FUNCTION'
  ORDER BY r.routine_name, p.ordinal_position;`

const [colRows, rpcRows] = await Promise.all([runQuery(COLS_SQL), runQuery(RPC_SQL)])

const tables = {}
for (const { table_name, column_name } of colRows) (tables[table_name] ??= []).push(column_name)

const rpcs = {}
for (const { routine_name, parameter_name } of rpcRows) {
  rpcs[routine_name] ??= []
  // PostgREST strips a leading underscore? No — args are passed by their declared name.
  if (parameter_name) rpcs[routine_name].push(parameter_name)
}

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
const manifest = { tables: sortKeys(tables), rpcs: sortKeys(rpcs) }

writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + "\n")
console.log(`✓ wrote schema-manifest.json — ${Object.keys(manifest.tables).length} tables/views, ${Object.keys(manifest.rpcs).length} rpcs`)
