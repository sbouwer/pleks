// scripts/gen-schema-columns.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Regenerates scripts/schema-columns.json — the committed table/view → columns
// manifest that scripts/check-supabase-columns.mjs validates `.select(...)` calls
// against. Part 2 of ADDENDUM_SCHEMA_SELECT_GUARD.
//
// MACHINE-GENERATED ON PURPOSE: a hand-edited manifest could itself carry the
// transcription error we're guarding against. Always regenerate; never hand-edit.
//
// Source of truth = the live DB's information_schema.columns (includes VIEWS —
// critical, since the drift hit landlord_view/organisations). Same Management-API
// connection pattern as check-schema-drift.mjs (SUPABASE_PROJECT_ID + _ACCESS_TOKEN
// from .env.local). When the typed `Database` artifact exists (Part 3), this can be
// swapped to parse that instead, unifying the schema source.
//
// USAGE:  node scripts/gen-schema-columns.mjs       # rewrites scripts/schema-columns.json
//         Run it whenever migrations change a table/view shape (gated by
//         check-drift-if-sql-changed.mjs, same as schema-drift).
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, "..")
const OUT_PATH = resolve(__dirname, "schema-columns.json")
dotenv.config({ path: resolve(ROOT_DIR, ".env.local") })

const PROJECT_REF = process.env.SUPABASE_PROJECT_ID
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error(
    "Missing SUPABASE_PROJECT_ID or SUPABASE_ACCESS_TOKEN in .env.local\n" +
    "Generate a token at https://supabase.com/dashboard/account/tokens",
  )
  process.exit(1)
}

const SQL = `
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position;
`

async function runQuery(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  )
  const data = await res.json()
  if (!Array.isArray(data)) {
    if (res.status === 401) {
      throw new Error("401 Unauthorized — SUPABASE_ACCESS_TOKEN in .env.local is invalid or expired.")
    }
    throw new Error(`Supabase API error (HTTP ${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

const rows = await runQuery(SQL)
const manifest = {}
for (const { table_name, column_name } of rows) {
  ;(manifest[table_name] ??= []).push(column_name)
}
// Sort keys for a stable, diffable file (columns keep ordinal order).
const sorted = {}
for (const k of Object.keys(manifest).sort()) sorted[k] = manifest[k]

writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n")
const tables = Object.keys(sorted).length
const cols = Object.values(sorted).reduce((s, c) => s + c.length, 0)
console.log(`✓ wrote schema-columns.json — ${tables} tables/views, ${cols} columns`)
