/**
 * lib/crypto/contentHash.ts — the one SHA-256 for EVIDENCE-grade content hashes
 *
 * Notes:  When an affidavit or a Tribunal bundle says "SHA-256 of the content", every such hash in the
 *         codebase must be computed the same way — same algorithm, same encoding — or the claim is only as
 *         trustworthy as the least careful call site. This is that one way: `sha256(content) → lowercase
 *         hex`. Use it for the integrity hash of a served/stored artefact: a notice's `body_full`, an
 *         export bundle, a screening/trust PDF, a ToS acceptance snapshot.
 *
 *         NOT for everything that hashes. A privacy IP-hash, a device fingerprint, a dedup lookup key
 *         (`id_number_hash`, bank-account hash), a PayFast MD5 signature, or a cache key are different
 *         operations with their own semantics — they have their own named helpers and are not "content".
 *
 *         Enforced by `pleks/no-raw-content-hash`: a raw `createHash("sha256")` outside lib/crypto is either
 *         evidence (use this) or wants its own purpose-named helper here; existing non-content sites are
 *         baselined.
 */
import { createHash } from "node:crypto"

/** SHA-256 of the content, as lowercase hex. The evidence-grade integrity hash — provably uniform. */
export function contentHash(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex")
}
