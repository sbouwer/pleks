/**
 * lib/exports/bundle.ts — Shared artefact bundle: upload + manifest-hash
 *
 * Auth:   Service-role only — never import in client components
 * Data:   Supabase Storage (bucket specified by caller)
 * Notes:  Generalised from BUILD_64's trust-audit-export manifest pattern.
 *         BUILD_65 (POPIA exports) and BUILD_66 (tribunal evidence) both consume.
 *         BUILD_64's lib/trust/audit-export.ts is NOT refactored to use this — Tier 2.
 */
import { createHash } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"

export type BundleArtefact = {
  name: string
  content_type:
    | "application/pdf"
    | "application/json"
    | "application/zip"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | string
  bytes: Buffer | Uint8Array
}

export type BundleResult = {
  manifest_hash: string
  artefact_hashes: Record<string, string>
  total_bytes: number
  storage_paths: Record<string, string>
}

function sha256(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex")
}

/**
 * Upload artefacts to Storage and compute a tamper-evident manifest hash.
 * manifest_hash = SHA-256 of the concatenation of per-artefact SHA-256 hex strings
 * in the order the artefacts are supplied. Matches BUILD_64's signing convention.
 */
export async function generateBundle(
  artefacts: BundleArtefact[],
  bucket: string,
  pathPrefix: string,
): Promise<BundleResult> {
  const db = createServiceClient()
  const artefact_hashes: Record<string, string> = {}
  const storage_paths: Record<string, string> = {}
  let total_bytes = 0

  for (const artefact of artefacts) {
    const hash = sha256(artefact.bytes)
    artefact_hashes[artefact.name] = hash
    total_bytes += artefact.bytes.byteLength

    const storagePath = `${pathPrefix}/${artefact.name}`
    const { error } = await (await db).storage
      .from(bucket)
      .upload(storagePath, artefact.bytes, {
        contentType: artefact.content_type,
        upsert: false,
      })

    if (error) {
      throw new Error(`[bundle] upload failed for ${artefact.name}: ${error.message}`)
    }

    storage_paths[artefact.name] = storagePath
  }

  const manifest_hash = sha256(
    Buffer.from(artefacts.map((a) => artefact_hashes[a.name]).join(""), "utf-8"),
  )

  return { manifest_hash, artefact_hashes, total_bytes, storage_paths }
}

/**
 * Verify a previously generated bundle by re-fetching artefacts from Storage
 * and recomputing their hashes.
 */
export async function verifyBundle(
  bucket: string,
  storage_paths: Record<string, string>,
  expected_manifest_hash: string,
): Promise<{ valid: boolean; mismatches?: string[] }> {
  const db = createServiceClient()
  const mismatches: string[] = []

  const hashes: string[] = []
  for (const [name, path] of Object.entries(storage_paths)) {
    const { data, error } = await (await db).storage.from(bucket).download(path)
    if (error || !data) {
      mismatches.push(`${name}: download failed — ${error?.message ?? "no data"}`)
      hashes.push("")
      continue
    }
    const bytes = Buffer.from(await data.arrayBuffer())
    hashes.push(sha256(bytes))
  }

  const recomputed = sha256(Buffer.from(hashes.join(""), "utf-8"))
  if (recomputed !== expected_manifest_hash) {
    mismatches.push(`manifest: expected ${expected_manifest_hash}, got ${recomputed}`)
  }

  return { valid: mismatches.length === 0, mismatches: mismatches.length > 0 ? mismatches : undefined }
}

/**
 * Generate a signed download URL from Storage (caller controls TTL).
 */
export async function signedDownloadUrl(
  bucket: string,
  storage_path: string,
  ttlSeconds: number,
): Promise<string> {
  const db = createServiceClient()
  const { data, error } = await (await db).storage
    .from(bucket)
    .createSignedUrl(storage_path, ttlSeconds)

  if (error || !data?.signedUrl) {
    throw new Error(`[bundle] signed URL failed for ${storage_path}: ${error?.message ?? "unknown"}`)
  }

  return data.signedUrl
}
