/**
 * scripts/encrypt-existing-pii.ts — one-time retrofit: encrypt existing plaintext PII at rest.
 *
 * Run ONCE per environment. SAFE-BY-DEFAULT: dry-run unless BOTH gates are passed.
 *
 *   npx tsx scripts/encrypt-existing-pii.ts                 # DRY RUN — reports what it WOULD do, writes nothing
 *   npx tsx scripts/encrypt-existing-pii.ts --commit --i-have-key-escrow-and-snapshot   # actually writes
 *
 * ⚠ This is the highest-risk, IRREVERSIBLE operation in the PII programme — it overwrites plaintext with
 *   ciphertext. Before --commit (CD ruling 2026-07-07, non-negotiable):
 *     1. KEY ESCROW FIRST — back up ENCRYPTION_KEY somewhere recoverable. Encrypt-then-lose-the-key = permanent,
 *        unrecoverable data loss. This is the #1 risk and the reason for the --i-have-key-escrow-and-snapshot gate.
 *     2. A VERIFIED, TEST-RESTORED DB snapshot taken immediately prior.
 *     3. Ship the encrypt-aware READ paths FIRST (done in the same PR) so nothing renders ciphertext mid-run.
 *   The script is idempotent (skips already-ciphertext rows via isEncrypted), round-trip-verifies every row
 *   before writing, and backfills id_number_hash (from the RAW value, same salt as the app) where a hash column
 *   exists — so cross-path dedup-by-hash keeps working. Re-runnable safely.
 *
 * Requires: ENCRYPTION_KEY, ID_NUMBER_HASH_SALT, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "path"
// Import the APP's crypto so ciphertext format + the hash salt match exactly (a re-implementation would drift).
import { encryptIdNumber, decryptIdNumber, hashIdNumber } from "../lib/crypto/idNumber"
import { isEncrypted } from "../lib/crypto/encryption"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

const COMMIT = process.argv.includes("--commit")
const ESCROW_CONFIRMED = process.argv.includes("--i-have-key-escrow-and-snapshot")
const WRITE = COMMIT && ESCROW_CONFIRMED

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface EncryptTask {
  table: string
  column: string
  /** When set, backfill this hash column from the RAW value (id_number surfaces). Omit where no hash column exists. */
  hashColumn?: string
}

// id_number surfaces first (this build's scope). The bank/passport rows are pre-existing PII-retrofit tasks.
const TASKS: EncryptTask[] = [
  { table: "contacts", column: "id_number", hashColumn: "id_number_hash" },
  { table: "contacts", column: "contact_id_number", hashColumn: "contact_id_number_hash" }, // company-signatory snapshot
  { table: "applications", column: "id_number", hashColumn: "id_number_hash" },
  { table: "application_co_applicants", column: "id_number", hashColumn: "id_number_hash" },
  { table: "application_directors", column: "id_number", hashColumn: "id_number_hash" },
  { table: "application_guarantors", column: "id_number" }, // no hash column on this table
  { table: "organisations", column: "id_number" },          // owner/principal SA ID — no hash column
  // SCOPE: id_number ONLY (the PII-at-rest build wired encrypt+decrypt for id_number). bank_account_number /
  // account_number / passport_number / permit_number are NOT encrypt-aware on the read side yet — encrypting them
  // would render ciphertext the app can't decrypt. They stay OUT until their own read paths + build ship.
]

interface TaskStat { table: string; column: string; total: number; encrypted: number; skipped: number; hashBackfilled: number }

async function encryptTable(task: EncryptTask): Promise<TaskStat> {
  const { table, column, hashColumn } = task
  const stat: TaskStat = { table, column, total: 0, encrypted: 0, skipped: 0, hashBackfilled: 0 }

  const selectCols = hashColumn ? `id, ${column}, ${hashColumn}` : `id, ${column}`
  const { data: rows, error } = await supabase.from(table).select(selectCols).not(column, "is", null)
  if (error) {
    console.error(`  ✗ ${table}.${column}: read failed — ${error.message}`)
    return stat
  }
  stat.total = rows?.length ?? 0
  if (!rows || rows.length === 0) {
    console.log(`  ${table}.${column}: 0 rows`)
    return stat
  }

  for (const row of rows as Array<Record<string, string | null>>) {
    const value = row[column]
    if (!value) continue

    if (isEncrypted(value)) {
      // Already ciphertext — but still backfill a missing hash (dedup key) from... we can't (no raw). Skip.
      stat.skipped++
      continue
    }

    const encrypted = encryptIdNumber(value) // AES-GCM; idempotent; null-safe
    if (!encrypted) { stat.skipped++; continue }

    // Round-trip verify BEFORE writing — never persist a value we can't read back.
    if (decryptIdNumber(encrypted) !== value) {
      console.error(`  ✗ ${table}.${column} id=${row.id}: round-trip FAILED — skipped`)
      continue
    }

    const update: Record<string, string | null> = { [column]: encrypted }
    // Backfill the lookup hash from the RAW value (same salt as the app) when a hash column exists + is empty.
    if (hashColumn && !row[hashColumn]) {
      update[hashColumn] = hashIdNumber(value)
      stat.hashBackfilled++
    }

    if (WRITE) {
      const { error: upErr } = await supabase.from(table).update(update).eq("id", row.id)
      if (upErr) { console.error(`  ✗ ${table}.${column} id=${row.id}: write failed — ${upErr.message}`); continue }
    }
    stat.encrypted++
  }

  const verb = WRITE ? "encrypted" : "WOULD encrypt"
  console.log(`  ${table}.${column}: ${stat.encrypted} ${verb}, ${stat.hashBackfilled} hash-backfilled, ${stat.skipped} already-encrypted (${stat.total} total)`)
  return stat
}

async function main() {
  console.log("=== PII Encryption Retrofit ===")
  console.log(WRITE ? "MODE: COMMIT (writing)" : "MODE: DRY RUN (no writes) — pass --commit --i-have-key-escrow-and-snapshot to write")
  if (COMMIT && !ESCROW_CONFIRMED) {
    console.error("\n✗ --commit given WITHOUT --i-have-key-escrow-and-snapshot. Refusing to write.")
    console.error("  Back up ENCRYPTION_KEY (escrow) + take a verified DB snapshot FIRST, then re-run with both flags.")
    process.exit(1)
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.error("\n✗ ENCRYPTION_KEY must be set in .env.local — the SAME key the app encrypts with.")
    process.exit(1)
  }
  // ID_NUMBER_HASH_SALT is OPTIONAL: hashIdNumber falls back to 'pleks-default-salt' when unset, exactly as the app
  // does. We only recompute hashes for rows MISSING one, so the salt is moot unless a backfill happens — but if it
  // does, it MUST match the app's runtime salt (default when unset). Warn so the operator can confirm.
  if (!process.env.ID_NUMBER_HASH_SALT) {
    console.warn("⚠ ID_NUMBER_HASH_SALT not set — using the app's fallback salt ('pleks-default-salt') for any hash backfill. Confirm the app's runtime salt matches.")
  }
  console.log(`Key: ${process.env.ENCRYPTION_KEY.slice(0, 8)}…  Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`)

  let totalEncrypted = 0
  for (const task of TASKS) {
    const stat = await encryptTable(task)
    totalEncrypted += stat.encrypted
  }

  console.log(`\n=== ${WRITE ? "Complete" : "Dry run complete"}: ${totalEncrypted} row(s) ${WRITE ? "encrypted" : "would be encrypted"} ===`)

  // Post-run verification: decrypt a sample from contacts (round-trip proof on real stored data).
  if (WRITE) {
    const { data: sample } = await supabase.from("contacts").select("id, id_number").not("id_number", "is", null).limit(1)
    const stored = sample?.[0]?.id_number
    if (stored && isEncrypted(stored)) {
      console.log(`\nSpot check (contacts): stored=${stored.slice(0, 20)}… decrypts=${decryptIdNumber(stored)?.slice(0, 4)}•••• ✅`)
    } else if (stored) {
      console.log(`\n⚠ Spot check: a contacts.id_number is NOT encrypted after the run: ${stored.slice(0, 8)}…`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
