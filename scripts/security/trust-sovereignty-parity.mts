/**
 * scripts/security/trust-sovereignty-parity.mts — DB half of the D-TRUST-01 parity check + ratchet
 *
 * Runs in security:db (check:full / CI). Two guarantees (ADDENDUM_TRUST_RPC_ATOMICITY step 0):
 *   1. Existence ratchet (CD condition 3): trust_sovereignty_trigger_enabled() returns false if the
 *      tr_trust_txn_sovereignty trigger is DROPPED or DISABLED (tgenabled) — so a migration that
 *      removes/disables the guard fails CI instead of passing silently.
 *   2. Parity (CD condition 2): the SAME shared vectors (lib/trust/sovereignty-vectors.ts) the vitest
 *      JS-assert test uses are fed to the live trigger — every BAD row must RAISE
 *      SOVEREIGN_TRUST_VIOLATION. One vector set, both layers → no drift.
 *
 * Usage: tsx scripts/security/trust-sovereignty-parity.mts [--ci]
 * The JS-assert half runs unconditionally; the DB half needs Supabase creds (skips with a notice
 * when absent). BAD inserts abort in the BEFORE trigger → nothing persists.
 */
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { assertPleksIsNotTrustee } from "@/lib/trust/invariants"
import { SOVEREIGNTY_BAD, SOVEREIGNTY_GOOD, type SovereigntyVector } from "@/lib/trust/sovereignty-vectors"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")
const ciMode = process.argv.slice(2).includes("--ci")

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf-8")
    const env: Record<string, string> = {}
    for (const line of raw.split("\n")) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const eq = t.indexOf("=")
      if (eq === -1) continue
      env[t.slice(0, eq)] = t.slice(eq + 1)
    }
    return env
  } catch {
    return {}
  }
}
const ENV = loadEnv()
const SUPABASE_URL = ciMode ? process.env.SUPABASE_URL : ENV.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = ciMode ? process.env.SUPABASE_SERVICE_ROLE_KEY : ENV.SUPABASE_SERVICE_ROLE_KEY

const failures: string[] = []
const fail = (m: string) => { failures.push(m); console.log(`  🔴 ${m}`) }
const ok = (m: string) => console.log(`  ✅ ${m}`)

function toOp(v: SovereigntyVector) {
  return {
    orgId: "00000000-0000-0000-0000-000000000000",
    direction: (v.direction === "credit" ? "inbound" : "outbound") as "inbound" | "outbound",
    source: v.source,
    initiatedBy: v.initiatedBy,
    amountCents: 1,
    description: v.label,
  }
}

console.log("\n🔒 D-TRUST-01 sovereignty parity (JS assert ⇄ DB trigger)")
console.log("─".repeat(60))

// ── JS-assert half — always runs, no DB needed ──
for (const v of SOVEREIGNTY_BAD) {
  let threw = false
  try { assertPleksIsNotTrustee(toOp(v)) } catch { threw = true }
  if (threw) ok(`JS assert rejects — ${v.label}`)
  else fail(`JS assert did NOT reject — ${v.label}`)
}
for (const v of SOVEREIGNTY_GOOD) {
  try { assertPleksIsNotTrustee(toOp(v)); ok(`JS assert allows — ${v.label}`) }
  catch { fail(`JS assert wrongly rejected — ${v.label}`) }
}

// ── DB half — trigger existence/enabled ratchet + same-vector RAISE parity ──
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log("  ⏭️  DB half skipped: Supabase creds absent (JS half above still gates).")
} else {
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // 1. Existence + enabled ratchet — false if dropped OR disabled (tgenabled).
  const { data: enabled, error: enErr } = await db.rpc("trust_sovereignty_trigger_enabled")
  if (enErr) fail(`trust_sovereignty_trigger_enabled() unavailable: ${enErr.message}`)
  else if (enabled !== true) fail("tr_trust_txn_sovereignty is DROPPED or DISABLED on trust_transactions")
  else ok("tr_trust_txn_sovereignty exists and is enabled")

  // 2. Same-vector parity — every BAD row must RAISE at the trigger (BEFORE INSERT → nothing persists).
  const { data: org } = await db.from("organisations").select("id").limit(1).single()
  if (!org) {
    console.log("  ⏭️  No org row to probe with — DB parity insert skipped.")
  } else {
    for (const v of SOVEREIGNTY_BAD) {
      const { error } = await db.from("trust_transactions").insert({
        org_id: (org as { id: string }).id,
        transaction_type: v.direction === "credit" ? "rent_received" : "owner_payment",
        direction: v.direction,
        amount_cents: 1,
        description: `sovereignty-parity ${v.label}`,
        source: v.source,
        initiated_by: v.initiatedBy,
      })
      if (error && /SOVEREIGN_TRUST_VIOLATION/.test(error.message)) ok(`DB trigger rejects — ${v.label}`)
      else if (error) fail(`DB insert errored for the WRONG reason — ${v.label}: ${error.message}`)
      else fail(`DB trigger did NOT reject — ${v.label} (row inserted!)`)
    }
  }
}

console.log("─".repeat(60))
if (failures.length) {
  console.log(`\n🚨 ${failures.length} sovereignty parity failure(s) — D-TRUST-01 guard broken\n`)
  process.exit(1)
}
console.log("✅ Sovereignty parity clean — JS assert and DB trigger agree\n")
process.exit(0)
