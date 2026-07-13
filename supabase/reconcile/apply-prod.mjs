/**
 * supabase/reconcile/apply-prod.mjs — apply a reconciliation script to PRODUCTION, from the file
 *
 * ⚠ WRITES TO PRODUCTION. Gated: requires --confirm, and refuses anything but 01_reconcile.sql.
 *
 * It reads the SQL FROM THE FILE and posts it. Nothing is retyped, nothing is pasted, and what runs is
 * byte-identical to what was reviewed — which is the whole point of assembling one reviewable artifact
 * instead of hand-feeding sections into a prompt.
 *
 * The script is a single BEGIN…COMMIT: it lands whole or aborts whole, leaving prod untouched.
 *
 * Run: node supabase/reconcile/apply-prod.mjs --confirm
 */
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "../..")
const SCRIPT = resolve(HERE, "01_reconcile.sql")

if (!process.argv.includes("--confirm")) {
  console.error("Refusing to touch production without --confirm.")
  process.exit(1)
}

const env = readFileSync(resolve(ROOT, ".env.local"), "utf8")
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "")
const PROJECT = pick("SUPABASE_PROJECT_ID")
const TOKEN = pick("SUPABASE_ACCESS_TOKEN")
if (!PROJECT || !TOKEN) {
  console.error("✗ SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN missing from .env.local")
  process.exit(1)
}

const sql = readFileSync(SCRIPT, "utf8")

// A sanity gate on the artifact itself: it must be the atomic envelope that was reviewed. If someone
// edits the script and drops the transaction, this refuses rather than half-applying it.
// Plain line scan, not a regex: `/^\s*BEGIN;\s*$/m` backtracks super-linearly, and the ReDoS lesson has
// already been learnt twice this week (the email check, the money formatter). A gate is not the place for it.
const lines = new Set(sql.split("\n").map((l) => l.trim()))
if (!lines.has("BEGIN;") || !lines.has("COMMIT;")) {
  console.error("✗ 01_reconcile.sql is not wrapped in BEGIN/COMMIT — refusing to apply a non-atomic script.")
  process.exit(1)
}

console.log(`\n▶ applying ${SCRIPT.replace(ROOT, ".")} to project ${PROJECT}`)
console.log(`  ${sql.split("\n").length} lines · one transaction · lands whole or aborts whole\n`)

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
})

const body = await res.text()
if (!res.ok) {
  console.error(`\n✗ APPLY FAILED (HTTP ${res.status}) — the transaction aborted, production is UNCHANGED.\n`)
  console.error(body)
  process.exit(1)
}

console.log("✓ applied. The transaction committed.\n")
console.log(body.slice(0, 400))
