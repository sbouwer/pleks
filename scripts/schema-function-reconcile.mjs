/**
 * scripts/schema-function-reconcile.mjs — every FUNCTION the migrations define, vs what production has
 *
 * The schema-contract manifest counts COLUMNS. It does not count FUNCTIONS — which is exactly how
 * `allocate_payment_atomic` came to exist in the migration files and NOT in the database, for months, with a
 * green test proving it worked. The test ran against a local stack carrying out-of-band state; prod never had
 * the function at all.
 *
 * DIRECTION is the load-bearing axis, and the two directions have OPPOSITE fixes:
 *
 *   file-ahead   defined in the migrations, absent (or stale) in prod  → DEPLOY it
 *   prod-ahead   present in prod, absent (or narrower) in the file     → AMEND the file forward
 *
 * Confusing them deletes a function production depends on, or ships one it was never meant to have.
 *
 * Read-only. Requires SUPABASE_PROJECT_ID + SUPABASE_ACCESS_TOKEN (from .env.local).
 * Run: node scripts/schema-function-reconcile.mjs
 */
import { readFileSync, readdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// ── env
const env = readFileSync(resolve(ROOT, ".env.local"), "utf8")
const pick = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "")
const PROJECT = pick("SUPABASE_PROJECT_ID")
const TOKEN = pick("SUPABASE_ACCESS_TOKEN")
if (!PROJECT || !TOKEN) {
  console.error("✗ SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN missing from .env.local")
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Management API ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── 1. Every function the migration files define.
const MIG = resolve(ROOT, "supabase/migrations")
const defined = new Map()   // name → { file, calls: Set<string> }
for (const f of readdirSync(MIG).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = readFileSync(resolve(MIG, f), "utf8")
  for (const m of sql.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?(\w+)\s*\(/gi)) {
    defined.set(m[1], { file: f })
  }
}

// ── 2. What prod actually has.
const rows = (await query(
  `SELECT p.proname AS name, pg_get_functiondef(p.oid) AS def
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'`,
)).map((r) => [r.name, r.def])
const live = new Map(rows)

// ── 3. Reconcile.
const missing = []      // file-ahead: defined, not deployed
const extra = []        // prod-ahead: deployed, not in any migration
for (const [name, meta] of defined) if (!live.has(name)) missing.push({ name, ...meta })
for (const name of live.keys()) if (!defined.has(name)) extra.push(name)

/**
 * A function that CALLS a missing function is BROKEN IN PRODUCTION — it raises "function does not exist" the
 * moment it is invoked. This is the difference between "a migration is behind" and "a live code path 500s".
 */
const brokenInProd = []
for (const [name, def] of live) {
  for (const m of missing) {
    if (new RegExp(`\\b${m.name}\\s*\\(`).test(def)) brokenInProd.push({ caller: name, missing: m.name })
  }
}

/**
 * PRESENCE IS NOT ENOUGH. `record_payment_atomic` exists in production AND in the file — and the two are
 * different functions. Prod runs the pre-#134 body; the file's calls `allocate_payment_atomic` for the
 * clause-6.6 interest-first allocation. A presence check calls that a match. It is not one.
 *
 * Comparing raw text is hopeless — `pg_get_functiondef` reformats. So compare BEHAVIOUR MARKERS: which
 * functions does the body call, and which tables does it write? Those are the things that, if they differ,
 * mean the deployed function does something the file does not (or the reverse).
 */
const knownFns = new Set([...defined.keys()].map((k) => k.toLowerCase()))
const WRITE_RES = [/\bINSERT\s+INTO\s+(\w+)/gi, /\bUPDATE\s+(\w+)/gi, /\bDELETE\s+FROM\s+(\w+)/gi]

const markers = (sql) => {
  const calls = [...sql.matchAll(/(\w+)\s*\(/g)].map((m) => m[1].toLowerCase())
  const writes = WRITE_RES.flatMap((re) => [...sql.matchAll(re)].map((m) => m[1].toLowerCase()))
  return {
    calls: new Set(calls.filter((c) => knownFns.has(c))),       // calls to OUR functions, not built-ins
    writes: new Set(writes),
  }
}

/**
 * The file's text for each function, so it can be compared against prod's.
 *
 * Scanned by SPLITTING on the CREATE marker rather than with a `[\s\S]*?\$\$;` match — that pattern backtracks
 * super-linearly across a 3 000-line migration. Same ReDoS lesson the email check and the money formatter
 * already taught; a linear scan is not a style preference here.
 *
 * The LAST definition of a name wins, because that is what a replay leaves behind — #158 deliberately
 * re-defines `disburse_deposit_atomic` in a new § at the bottom of 004 and relies on exactly that.
 */
const fileText = new Map()
for (const f of readdirSync(MIG).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = readFileSync(resolve(MIG, f), "utf8")
  const chunks = sql.split(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+/i).slice(1)
  for (const chunk of chunks) {
    const name = /^(?:public\.)?(\w+)/.exec(chunk)?.[1]
    if (!name) continue

    // DOLLAR-QUOTE AWARE. The body runs from the opening `$tag$` to the matching CLOSING `$tag$` — not to the
    // first `$$;`. A naive slice bleeds straight past the function into the CREATE POLICY / ALTER TABLE that
    // follows it, and then reports "prod does not write `using`, `on`, `so`" — which are not tables. The first
    // draft did exactly that, and a detector whose findings are mostly noise gets ignored, which is worse than
    // having no detector at all.
    const open = /AS\s+(\$\w*\$)/i.exec(chunk)
    if (!open) continue
    const tag = open[1]
    const from = open.index + open[0].length
    const close = chunk.indexOf(tag, from)
    fileText.set(name, close === -1 ? chunk.slice(from) : chunk.slice(from, close))
  }
}

/** Prod's `pg_get_functiondef` returns the whole CREATE — take only what is between the dollar quotes. */
const bodyOf = (def) => {
  const open = /AS\s+(\$\w*\$)/i.exec(def)
  if (!open) return def
  const from = open.index + open[0].length
  const close = def.indexOf(open[1], from)
  return close === -1 ? def.slice(from) : def.slice(from, close)
}

const bodyDrift = []
for (const [name, prodDef] of live) {
  const ours = fileText.get(name)
  if (!ours) continue
  const a = markers(ours), b = markers(bodyOf(prodDef))
  const lostCalls = [...a.calls].filter((c) => !b.calls.has(c))
  const gainedCalls = [...b.calls].filter((c) => !a.calls.has(c))
  const lostWrites = [...a.writes].filter((w) => !b.writes.has(w))
  const gainedWrites = [...b.writes].filter((w) => !a.writes.has(w))
  if (lostCalls.length || gainedCalls.length || lostWrites.length || gainedWrites.length) {
    bodyDrift.push({ name, lostCalls, gainedCalls, lostWrites, gainedWrites })
  }
}

const line = "─".repeat(96)
console.log(`\n🔎  Function reconciliation — migrations (${defined.size}) vs production (${live.size})`)
console.log(line)

if (missing.length) {
  console.log(`\n  FILE-AHEAD — defined in the migrations, ABSENT from production (${missing.length}).`)
  console.log(`  Fix: DEPLOY. Do NOT delete — the file is the intent, prod is simply behind it.`)
  for (const m of missing) console.log(`      • ${m.name.padEnd(46)} ${m.file}`)
}

if (brokenInProd.length) {
  console.log(`\n  ⛔ BROKEN IN PRODUCTION (${brokenInProd.length}) — a LIVE function calls one that does not exist.`)
  console.log(`  Every one of these raises "function does not exist" the moment the path is exercised.`)
  for (const b of brokenInProd) console.log(`      • ${b.caller} → calls missing ${b.missing}()`)
}

if (extra.length) {
  console.log(`\n  PROD-AHEAD — live, but no migration defines them (${extra.length}).`)
  console.log(`  Fix: AMEND THE FILE FORWARD. A fresh local reset does not have these, so any test that`)
  console.log(`  touches them is testing a schema that does not exist.`)
  for (const e of [...extra].sort((a, b) => a.localeCompare(b))) console.log(`      • ${e}`)
}

if (bodyDrift.length) {
  console.log(`\n  ⚠ BODY DRIFT (${bodyDrift.length}) — the function exists in BOTH, and they are not the same function.`)
  console.log(`  A presence check calls these a match. They are the most dangerous kind of drift, because`)
  console.log(`  nothing anywhere looks wrong: the name resolves, the call succeeds, and it does something else.`)
  for (const d of bodyDrift) {
    console.log(`      • ${d.name}`)
    if (d.lostCalls.length) console.log(`          prod does NOT call : ${d.lostCalls.join(", ")}   (the file does)`)
    if (d.gainedCalls.length) console.log(`          prod ALSO calls    : ${d.gainedCalls.join(", ")}   (the file does not)`)
    if (d.lostWrites.length) console.log(`          prod does NOT write: ${d.lostWrites.join(", ")}   (the file does)`)
    if (d.gainedWrites.length) console.log(`          prod ALSO writes   : ${d.gainedWrites.join(", ")}   (the file does not)`)
  }
}

console.log(`\n${line}`)
if (!missing.length && !extra.length) console.log("  ✓ every migration function is deployed, and vice versa")
else console.log(`  ${missing.length} file-ahead · ${extra.length} prod-ahead · ${brokenInProd.length} broken in prod`)
console.log(line)

// Reporting tool, not a gate — it never fails the build. The GATE is the manifest (see OUTSTANDING.md).
