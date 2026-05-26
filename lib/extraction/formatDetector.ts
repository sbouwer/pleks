/**
 * lib/extraction/formatDetector.ts — Magic-byte format detection for all supported formats
 *
 * Returns DocumentFormat for every file in the pipeline (including rejected types like PSD, DOCX).
 * The upload validator uses separate allow-list logic — this module only identifies what a file IS.
 *
 * Spec: ADDENDUM_14L §4.2
 */
import type { DocumentFormat } from "./types"

export function detectFormat(filename: string, bytes: Uint8Array): DocumentFormat {
  if (bytes.length < 8) return "unknown"

  const b = bytes
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""

  // PDF: %PDF (25 50 44 46)
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"

  // JPEG: FF D8 FF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image-jpeg"

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
    b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A
  ) return "image-png"

  // PSD: 38 42 50 53 ("8BPS")
  if (b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53) return "psd"

  // ZIP-based formats (DOCX, ODT both start with PK 50 4B 03 04)
  if (b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04) {
    if (ext === "docx") return "docx"
    if (ext === "odt")  return "odt"
    return "unknown"
  }

  // HEIC/HEIF — should never reach server (converted client-side), but identify for harness
  if (ext === "heic" || ext === "heif") return "image-other"

  // Extension fallback for known image types without distinctive magic bytes
  if (ext === "jpg" || ext === "jpeg") return "image-jpeg"
  if (ext === "png")                   return "image-png"
  if (ext === "docx")                  return "docx"
  if (ext === "odt")                   return "odt"
  if (ext === "psd")                   return "psd"

  return "unknown"
}
