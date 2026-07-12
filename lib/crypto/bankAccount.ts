/**
 * lib/crypto/bankAccount.ts — bank account numbers: display mask, deterministic lookup hash, at-rest encryption
 *
 * Notes:  The shape of lib/crypto/idNumber.ts, for the same reason. `tenant_bank_accounts.account_number_enc`
 *         has existed since migration 042 and NOTHING has ever written to it: the importer stored only a mask
 *         plus a hash, both of which are one-way. So the number was UNRECOVERABLE — while the wizard told the
 *         agent it was "stored encrypted and used for deposit refund processing", which a mask cannot do. An
 *         agent processing a refund needs the real number back. This wires the column that was provisioned
 *         for it (CD ruling 2026-07-12: encrypt, do not keep masked-only).
 *
 *         Three columns, always written TOGETHER via bankAccountColumns():
 *           account_number      — the MASK. NOT NULL, and what display surfaces read. Never the raw value.
 *           account_number_enc  — AES-GCM ciphertext. Random IV → NON-deterministic; never MATCH on it.
 *           account_number_hash — SHA-256 of the RAW value: the deterministic dedup/lookup key. Match on THIS.
 *
 *         Read back through the TOLERANT decryptBankAccount — a legacy/raw value passes through unchanged, so
 *         a mixed table never throws.
 */
import { createHash } from "node:crypto"
import { encrypt, decrypt, isEncrypted } from "./encryption"
import { optionalEnv } from "@/lib/env"

/**
 * Masks a bank account number for display.
 * Shows last 4 digits only: "6241234567" → "••••••4567"
 */
export function maskBankAccount(accountNumber: string): string {
  if (!accountNumber) return "—"
  const clean = accountNumber.replace(/\s/g, "")
  if (clean.length <= 4) return "••••"
  return `${"•".repeat(clean.length - 4)}${clean.slice(-4)}`
}

/** The deterministic dedup/lookup key, computed from the RAW number. AES-GCM ciphertext uses a random IV and
 *  therefore cannot serve this purpose — anything that MATCHES an account must match on this hash. */
export function hashBankAccount(raw: string): string {
  const normalised = raw.replace(/\s/g, "")
  // ⚠ ROTATION HAZARD: there is no key/salt VERSION column on tenant_bank_accounts. If BANK_ACCOUNT_HASH_SALT
  // is ever changed, every account_number_hash already on disk silently stops matching — the dedup/lookup key
  // simply misses, duplicate accounts accumulate, and nothing errors. Changing it is therefore a BACKFILL
  // (decrypt account_number_enc → re-hash), not an env edit. Set it once, at first deploy.
  // Until it IS set, the default below is a committed literal: the salt frustrates a generic rainbow table,
  // it does not make the hash secret. The at-rest secret is account_number_enc.
  const salt = optionalEnv("BANK_ACCOUNT_HASH_SALT", "pleks-default-salt")
  return createHash("sha256").update(normalised + salt).digest("hex")
}

/** Encrypt for storage. null/empty → null; already-ciphertext → unchanged (idempotent). */
export function encryptBankAccount(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim()
  if (!v) return null
  return isEncrypted(v) ? v : encrypt(v)
}

/** Decrypt at a read boundary. TOLERANT: a value that is not ciphertext (legacy/raw) passes through unchanged. */
export function decryptBankAccount(stored: string | null | undefined): string | null {
  const v = stored ?? null
  if (!v) return null
  return isEncrypted(v) ? decrypt(v) : v
}

/**
 * The persisted columns for a bank account at a write boundary. Spread into an insert so the mask, the
 * ciphertext and the lookup hash ALWAYS move together — a mask written without the ciphertext (what the
 * importer did, making the number unrecoverable) or a ciphertext without the hash (which silently breaks
 * dedup) is exactly the drift this prevents. null/empty → all three null.
 */
export function bankAccountColumns(raw: string | null | undefined): {
  account_number: string | null
  account_number_enc: string | null
  account_number_hash: string | null
} {
  const v = (raw ?? "").trim() || null
  if (!v) return { account_number: null, account_number_enc: null, account_number_hash: null }

  return {
    account_number: maskBankAccount(v),
    account_number_enc: encryptBankAccount(v),
    account_number_hash: hashBankAccount(v),
  }
}
