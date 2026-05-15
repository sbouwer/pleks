/**
 * lib/searchworx/storage.ts — Download Searchworx vendor artefacts and store in Supabase Storage
 *
 * Notes:  ADDENDUM_14H §5 + Amendment §E. Searchworx PDFs and imagery URLs are publicly-accessible
 *         GUIDs — anyone with the URL can access the artefact. They must never leave lib/searchworx/.
 *         This module is the ONLY legitimate caller of uatapp.searchworks.co.za and rest.searchworks.co.za
 *         export/artefact URLs. After upload the vendor URL is discarded; callers get a Supabase path.
 *         ESLint rule in eslint.config.mjs enforces the containment boundary.
 */
import { createServiceClient } from "@/lib/supabase/server"

const STORAGE_BUCKET = "screening-reports"

export interface DownloadArtefactArgs {
  vendorUrl:    string                                              // raw vendor URL — never persisted, never logged
  orgId:        string
  refId:        string                                              // property_intelligence_pulls.id or application_screening_payments.id
  productKey:   string                                              // product_type slug (e.g. "deeds_search") — disambiguates bundle PDFs
  searchToken:  string
  artefactKind: "pdf" | "aerial" | "street" | "map" | "cadaster" | "chart" | string
  mimeType:     "application/pdf" | "image/jpeg" | "image/png"
}

export interface DownloadArtefactResult {
  storagePath: string  // {orgId}/{refId}/{productKey}/{searchToken}-{artefactKind}.{ext}
  byteSize:    number
}

function mimeToExt(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf"
  if (mimeType === "image/jpeg")      return "jpg"
  if (mimeType === "image/png")       return "png"
  return "bin"
}

export async function downloadAndStoreSearchworxArtefact(
  args: DownloadArtefactArgs,
): Promise<DownloadArtefactResult> {
  const response = await fetch(args.vendorUrl, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    throw new Error(`Searchworx artefact fetch HTTP ${response.status} for kind=${args.artefactKind}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())

  const ext         = mimeToExt(args.mimeType)
  const storagePath = `${args.orgId}/${args.refId}/${args.productKey}/${args.searchToken}-${args.artefactKind}.${ext}`

  const db = await createServiceClient()
  const { error } = await db.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: args.mimeType,
    upsert:      true,
  })
  if (error) throw new Error(`Searchworx artefact upload failed: ${error.message}`)

  return { storagePath, byteSize: buffer.byteLength }
}
