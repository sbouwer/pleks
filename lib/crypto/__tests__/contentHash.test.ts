/**
 * lib/crypto/__tests__/contentHash.test.ts — the evidence hash is a stable, known SHA-256
 *
 * Pins that contentHash is plain lowercase-hex SHA-256 of the bytes — so a value stored today verifies
 * against a hand-run `sha256sum` in a dispute years later — and that a string and its UTF-8 bytes agree
 * (the trust-export migration replaced sequential .update() with Buffer.concat, relying on that).
 */
import { describe, it, expect } from "vitest"
import { createHash } from "node:crypto"
import { contentHash } from "../contentHash"

describe("contentHash", () => {
  it("is lowercase-hex SHA-256 of the content", () => {
    // Known vector: sha256("abc")
    expect(contentHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(contentHash("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  it("hashes a string and its UTF-8 buffer identically (the Buffer.concat migration relies on this)", () => {
    const s = "trust-audit-manifest-2027"
    expect(contentHash(s)).toBe(contentHash(Buffer.from(s, "utf-8")))
  })

  it("concatenated buffers equal a sequential digest (byte-identity of the trust-export change)", () => {
    const a = Buffer.from("pdf-bytes"), b = Buffer.from("xlsx-bytes")
    const sequential = createHash("sha256").update(a).update(b).digest("hex")
    expect(contentHash(Buffer.concat([a, b]))).toBe(sequential)
  })
})
