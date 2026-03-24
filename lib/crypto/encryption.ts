import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) throw new Error("ENCRYPTION_KEY environment variable is not set")
  if (keyHex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${keyHex.length} chars.`
    )
  }
  return Buffer.from(keyHex, "hex")
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns: "{iv_hex}:{ciphertext_hex}:{authtag_hex}"
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString("hex"),
    encrypted.toString("hex"),
    authTag.toString("hex"),
  ].join(":")
}

/**
 * Decrypts a value produced by encrypt().
 * Throws if the ciphertext has been tampered with.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(":")

  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format — expected iv:ciphertext:authtag")
  }

  const [ivHex, encryptedHex, authTagHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8")
}

/**
 * Decrypts a nullable DB value. Returns null if value is null/undefined.
 */
export function decryptNullable(value: string | null | undefined): string | null {
  if (!value) return null
  return decrypt(value)
}

/**
 * Returns true if the value looks like it was produced by encrypt().
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":")
  if (parts.length !== 3) return false
  return parts.every((p) => /^[0-9a-f]+$/.test(p))
}

/**
 * Encrypts a value only if it is not already encrypted.
 */
export function encryptIfNeeded(value: string): string {
  if (isEncrypted(value)) return value
  return encrypt(value)
}
