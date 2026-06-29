/**
 * idNumber.test.ts — ID-number at-rest encryption helpers (apply-flow PII).
 *
 * The load-bearing property: AES-GCM uses a random IV, so the same plaintext encrypts to DIFFERENT ciphertext each
 * time — anything that MATCHES on id_number (marital flags, spouse link, dedup) must decrypt first. And decrypt is
 * tolerant of raw/legacy values so a mixed table never throws.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { encryptIdNumber, decryptIdNumber } from "../idNumber"

beforeAll(() => { process.env.ENCRYPTION_KEY = "0".repeat(64) }) // 32-byte test key (64 hex)

describe("encryptIdNumber / decryptIdNumber", () => {
  it("round-trips: ciphertext (iv:ct:tag) ≠ plaintext, decrypt recovers it", () => {
    const raw = "9001015800087"
    const enc = encryptIdNumber(raw)!
    expect(enc).not.toBe(raw)
    expect(enc.split(":")).toHaveLength(3)
    expect(decryptIdNumber(enc)).toBe(raw)
  })

  it("the same value encrypts DIFFERENTLY each time (random IV) — never match ciphertext directly", () => {
    expect(encryptIdNumber("9001015800087")).not.toBe(encryptIdNumber("9001015800087"))
  })

  it("null / empty → null on both helpers", () => {
    expect(encryptIdNumber(null)).toBeNull()
    expect(encryptIdNumber("   ")).toBeNull()
    expect(decryptIdNumber(null)).toBeNull()
    expect(decryptIdNumber("")).toBeNull()
  })

  it("decrypt is TOLERANT — a raw/legacy value passes through unchanged (never throws)", () => {
    expect(decryptIdNumber("9001015800087")).toBe("9001015800087")
  })

  it("encrypt is idempotent — an already-encrypted value passes through", () => {
    const enc = encryptIdNumber("9001015800087")!
    expect(encryptIdNumber(enc)).toBe(enc)
  })
})
