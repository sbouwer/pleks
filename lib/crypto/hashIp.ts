/**
 * lib/crypto/hashIp.ts — one SHA-256 for privacy-hashing an IP address
 *
 * Notes:  Several auth/rate-limit paths hash the caller's IP before storing or comparing it, so a raw IP
 *         never lands in a log or a rate-limit key (POPIA minimisation). This is that one hash — NOT the
 *         evidence hash (that is contentHash): an IP hash is a privacy transform, not a "SHA-256 of the
 *         content" an affidavit relies on.
 */
import { createHash } from "node:crypto"

/** SHA-256 of an IP address, as lowercase hex — a privacy hash for logs and rate-limit keys. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex")
}
