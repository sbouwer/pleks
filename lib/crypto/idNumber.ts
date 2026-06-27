/**
 * lib/crypto/idNumber.ts — SA ID number helpers: validation, deterministic hashing, and at-rest encryption.
 *
 * Notes:  hashIdNumber = deterministic SHA-256(normalised + salt) — the LOOKUP/dedup key (id_number_hash), computed
 *         from the RAW value. encryptIdNumber/decryptIdNumber = AES-256-GCM at-rest (apply flow). The ciphertext is
 *         NON-deterministic (random IV), so anything that MATCHES on id_number must decrypt first — never compare
 *         ciphertext. decrypt is tolerant (raw/legacy passes through). encrypt/decrypt + isEncrypted live in
 *         ./encryption; the deterministic key here is hashIdNumber, not the ciphertext.
 */
import { createHash } from "crypto"
import { encrypt, decrypt, isEncrypted } from "./encryption"

export function hashIdNumber(idNumber: string): string {
  const normalised = idNumber.replace(/\s/g, "").toUpperCase()
  const salt = process.env.ID_NUMBER_HASH_SALT || "pleks-default-salt"
  return createHash("sha256").update(normalised + salt).digest("hex")
}

/** Encrypt an ID number for storage (AES-256-GCM). null/empty → null; already-encrypted → unchanged (idempotent).
 *  The deterministic lookup/dedup key is `id_number_hash` (hashIdNumber on the RAW value) — compute that from the
 *  RAW input, never from the ciphertext (AES-GCM uses a random IV → ciphertext is non-deterministic, can't match). */
export function encryptIdNumber(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim()
  if (!v) return null
  return isEncrypted(v) ? v : encrypt(v)
}

/** Decrypt a stored ID number. null/empty → null. TOLERANT: a value that isn't ciphertext (legacy/raw, or a
 *  fake-data row) passes through unchanged — so a mixed table never throws and matching/display stay correct. */
export function decryptIdNumber(stored: string | null | undefined): string | null {
  const v = stored ?? null
  if (!v) return null
  return isEncrypted(v) ? decrypt(v) : v
}

/** spouse_info jsonb carries an `idNumber` (the linked spouse's ID) — encrypt/decrypt JUST that field, leaving the
 *  rest of the object intact. Encrypt before store; decrypt at the read boundary before matching/display. */
export function encryptSpouseInfo(si: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!si || typeof si !== "object") return null
  const id = si.idNumber
  return typeof id === "string" && id ? { ...si, idNumber: encryptIdNumber(id) } : { ...si }
}
export function decryptSpouseInfo(si: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!si || typeof si !== "object") return null
  const id = si.idNumber
  return typeof id === "string" && id ? { ...si, idNumber: decryptIdNumber(id) } : { ...si }
}

export function validateSAIdNumber(id: string): {
  valid: boolean
  dob?: Date
  gender?: "male" | "female"
  citizenship?: "sa_citizen" | "permanent_resident"
} {
  const clean = id.replace(/\s/g, "")
  if (!/^\d{13}$/.test(clean)) return { valid: false }

  const year = parseInt(clean.slice(0, 2))
  const month = parseInt(clean.slice(2, 4))
  const day = parseInt(clean.slice(4, 6))
  const currentYearShort = new Date().getFullYear() % 100
  const fullYear = year <= currentYearShort ? 2000 + year : 1900 + year
  const dob = new Date(fullYear, month - 1, day)

  if (isNaN(dob.getTime()) || month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false }
  }

  const genderCode = parseInt(clean.slice(6, 10))
  const gender = genderCode < 5000 ? "female" : "male"
  const citizenship = clean[10] === "0" ? "sa_citizen" : "permanent_resident"

  // Luhn check
  let sum = 0
  for (let i = 0; i < 12; i++) {
    let digit = parseInt(clean[i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  const checkDigit = (10 - (sum % 10)) % 10
  const valid = checkDigit === parseInt(clean[12])

  return { valid, dob, gender, citizenship }
}

export function maskIdNumber(idNumber: string): string {
  if (!idNumber) return "—"
  const clean = idNumber.replace(/\s/g, "")
  if (clean.length === 13) {
    return `${clean.slice(0, 4)}•••••••${clean.slice(9)}`
  }
  if (clean.length > 5) {
    return `${clean.slice(0, 2)}${"•".repeat(clean.length - 5)}${clean.slice(-3)}`
  }
  return "••••"
}
