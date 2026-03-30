/**
 * Encrypt existing plaintext PII in the database.
 * Run ONCE per environment (dev, then prod).
 *
 * Usage: npx tsx scripts/encrypt-existing-pii.ts
 *
 * Requires: ENCRYPTION_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * in .env.local
 */

import { createClient } from "@supabase/supabase-js"
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import * as dotenv from "dotenv"
import * as path from "path"

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex chars in .env.local")
  }
  return Buffer.from(keyHex, "hex")
}

function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString("hex"), encrypted.toString("hex"), authTag.toString("hex")].join(":")
}

function decrypt(ciphertext: string): string {
  const key = getKey()
  const [ivHex, encryptedHex, authTagHex] = ciphertext.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

function isEncrypted(value: string): boolean {
  const parts = value.split(":")
  if (parts.length !== 3) return false
  return parts.every((p) => /^[0-9a-f]+$/.test(p))
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface EncryptTask {
  table: string
  column: string
  idColumn?: string
}

const TASKS: EncryptTask[] = [
  { table: "contacts", column: "id_number" },
  { table: "contractors", column: "bank_account_number" },
  { table: "tenant_bank_accounts", column: "account_number" },
  { table: "applications", column: "id_number" },
  { table: "applications", column: "passport_number" },
  { table: "applications", column: "permit_number" },
  { table: "application_co_applicants", column: "id_number" },
  { table: "application_guarantors", column: "id_number" },
  { table: "debicheck_mandates", column: "debtor_account_number" },
]

async function encryptTable(task: EncryptTask): Promise<number> {
  const { table, column } = task
  let migrated = 0

  // Fetch all rows where the column is not null
  const { data: rows, error } = await supabase
    .from(table)
    .select(`id, ${column}`)
    .not(column, "is", null)

  if (error) {
    console.error(`  Error reading ${table}.${column}:`, error.message)
    return 0
  }

  if (!rows || rows.length === 0) {
    console.log(`  ${table}.${column}: 0 rows (empty or all null)`)
    return 0
  }

  for (const row of rows) {
    const value = row[column] as string
    if (!value) continue

    // Skip if already encrypted
    if (isEncrypted(value)) {
      continue
    }

    // Encrypt
    const encrypted = encrypt(value)

    // Verify round-trip
    const decrypted = decrypt(encrypted)
    if (decrypted !== value) {
      console.error(`  ❌ Round-trip verification FAILED for ${table}.${column} id=${row.id}`)
      console.error(`     Original: ${value.slice(0, 4)}...`)
      console.error(`     Decrypted: ${decrypted.slice(0, 4)}...`)
      continue
    }

    // Update
    const { error: updateError } = await supabase
      .from(table)
      .update({ [column]: encrypted })
      .eq("id", row.id)

    if (updateError) {
      console.error(`  ❌ Update failed for ${table}.${column} id=${row.id}:`, updateError.message)
    } else {
      migrated++
    }
  }

  console.log(`  ${table}.${column}: ${migrated} rows encrypted (${rows.length} total, ${rows.length - migrated} skipped/already encrypted)`)
  return migrated
}

async function main() {
  console.log("=== PII Encryption Retrofit ===")
  console.log(`Key: ${process.env.ENCRYPTION_KEY?.slice(0, 8)}...`)
  console.log(`Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log("")

  let totalMigrated = 0

  for (const task of TASKS) {
    totalMigrated += await encryptTable(task)
  }

  console.log("")
  console.log(`=== Complete: ${totalMigrated} total rows encrypted ===`)

  // Spot check: read back 1 row from contacts if any exist
  const { data: spotCheck } = await supabase
    .from("contacts")
    .select("id, id_number")
    .not("id_number", "is", null)
    .limit(1)

  if (spotCheck && spotCheck.length > 0 && spotCheck[0].id_number) {
    const stored = spotCheck[0].id_number
    if (isEncrypted(stored)) {
      const decrypted = decrypt(stored)
      console.log(`\nSpot check (contacts): stored=${stored.slice(0, 20)}... decrypted=${decrypted.slice(0, 4)}••••`)
      console.log("✅ Spot check passed")
    } else {
      console.log(`\nSpot check: value does not appear encrypted: ${stored.slice(0, 10)}...`)
    }
  } else {
    console.log("\nNo contact records with id_number to spot check.")
  }
}

main().catch(console.error)
