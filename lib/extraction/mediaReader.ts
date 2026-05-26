/**
 * lib/extraction/mediaReader.ts — Convert document bytes to Anthropic content blocks
 *
 * PDF  → document block (native Claude PDF support, D-14L-21)
 * JPEG/PNG → image block
 *
 * Inline types intentionally avoid importing from @anthropic-ai/sdk (ESLint restriction).
 * The returned objects are structurally compatible with DocumentBlockParam / ImageBlockParam.
 *
 * Spec: ADDENDUM_14L §4.2
 */
import type { DocumentFormat } from "./types"

interface PdfBlock {
  type: "document"
  source: { type: "base64"; media_type: "application/pdf"; data: string }
  title: string
}

interface ImageBlock {
  type: "image"
  source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string }
}

export type MediaBlock = PdfBlock | ImageBlock

export function toMediaBlock(bytes: Uint8Array, format: DocumentFormat, filename: string): MediaBlock {
  const data = Buffer.from(bytes).toString("base64")

  if (format === "pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
      title: filename,
    }
  }

  const mediaType = format === "image-jpeg" ? "image/jpeg" : "image/png"
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data },
  }
}
