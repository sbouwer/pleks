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
import type { Document } from "./types"

interface PdfBlock {
  type: "document"
  source: { type: "base64"; media_type: "application/pdf"; data: string }
  title: string
}

interface TextDocBlock {
  type: "document"
  source: { type: "text"; media_type: "text/plain"; data: string }
  title: string
}

interface ImageBlock {
  type: "image"
  source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string }
}

export type MediaBlock = PdfBlock | TextDocBlock | ImageBlock

export function toMediaBlock(doc: Pick<Document, "bytes" | "format" | "filename" | "textContent">): MediaBlock {
  // Encrypted PDF decrypted upstream → send the extracted text as a text document block (Claude can't read the
  // encrypted bytes). (lib/extraction/pdfDecrypt + pipeline pre-decrypt pass.)
  if (doc.textContent != null) {
    return {
      type: "document",
      source: { type: "text", media_type: "text/plain", data: doc.textContent },
      title: doc.filename,
    }
  }

  const data = Buffer.from(doc.bytes).toString("base64")

  if (doc.format === "pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
      title: doc.filename,
    }
  }

  const mediaType = doc.format === "image-jpeg" ? "image/jpeg" : "image/png"
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data },
  }
}
