/**
 * lib/extraction/uploadValidator.ts — Four-gate upload validation
 *
 * Gate 1: extension allow-list (pdf, jpeg/jpg, png)
 * Gate 2: MIME type allow-list
 * Gate 3: magic bytes match
 * Gate 4: protected-PDF detection (PDFs only — /Encrypt token scan)
 *
 * Spec: ADDENDUM_14L §15.3, D-14L-22, D-14L-27
 */

export const ALLOWED_FORMATS = ["pdf", "jpeg", "png"] as const
export type AllowedFormat = (typeof ALLOWED_FORMATS)[number]

export interface ValidationResult {
  valid: boolean
  format: AllowedFormat | null
  rejectionReason: "extension-not-allowed" | "mime-not-allowed" | "magic-bytes-mismatch" | "empty-file" | "pdf-encrypted" | null
  userMessage: string | null
}

const EXTENSION_MAP: Record<string, AllowedFormat> = {
  pdf:  "pdf",
  jpeg: "jpeg",
  jpg:  "jpeg",
  png:  "png",
}

const MIME_MAP: Record<string, AllowedFormat> = {
  "application/pdf": "pdf",
  "image/jpeg":      "jpeg",
  "image/jpg":       "jpeg",
  "image/png":       "png",
}

// Detect a genuinely encrypted PDF. The trailer's /Encrypt entry is ALWAYS an indirect reference
// (`/Encrypt N G R`) and the trailer itself is never encrypted, so that exact token reliably marks an encrypted
// file. A bare "/Encrypt" substring does NOT — it appears in plenty of unencrypted PDFs (field/key names,
// content streams, XMP metadata) and was the cause of false "password-protected" rejections. We also scan the
// whole file (latin1, so bytes map 1:1 to char codes) rather than just the last 4 KB, which missed the trailer
// in linearized/large PDFs.
export function isProtectedPdf(bytes: Uint8Array): boolean {
  const ascii = new TextDecoder("latin1").decode(bytes)
  return /\/Encrypt\s+\d+\s+\d+\s+R\b/.test(ascii)
}

function checkMagicBytes(bytes: Uint8Array): AllowedFormat | null {
  if (bytes.length < 8) return null
  // PDF: %PDF (25 50 44 46)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf"
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "jpeg"
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
  ) return "png"
  return null
}

export function validateUpload(filename: string, mimeType: string, bytes: Uint8Array): ValidationResult {
  if (bytes.length === 0) {
    return { valid: false, format: null, rejectionReason: "empty-file", userMessage: "The file is empty." }
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const extFormat = EXTENSION_MAP[ext] ?? null
  if (extFormat === null) {
    const safeExt = ext.length > 0 ? `.${ext}` : "(no extension)"
    return {
      valid: false,
      format: null,
      rejectionReason: "extension-not-allowed",
      userMessage: `File type ${safeExt} is not accepted. Please upload a PDF, JPEG, or PNG.`,
    }
  }

  const mimeFormat = MIME_MAP[mimeType.toLowerCase()] ?? null
  if (mimeFormat === null) {
    return {
      valid: false,
      format: null,
      rejectionReason: "mime-not-allowed",
      userMessage: "File type not accepted. Please upload a PDF, JPEG, or PNG.",
    }
  }

  const magicFormat = checkMagicBytes(bytes)
  if (magicFormat === null || magicFormat !== extFormat || magicFormat !== mimeFormat) {
    return {
      valid: false,
      format: null,
      rejectionReason: "magic-bytes-mismatch",
      userMessage: "The file content does not match its extension. Please re-export and try again.",
    }
  }

  // NOTE: encrypted PDFs are NOT rejected here. Most SA statements ship encrypted with an empty user password
  // (they open with no prompt) and the pipeline decrypts them to text (lib/extraction/pdfDecrypt). A genuinely
  // password-locked PDF is surfaced downstream (extraction can't read it → password-required), not blocked at
  // upload — so a benign empty-password file is never wrongly rejected.
  return { valid: true, format: magicFormat, rejectionReason: null, userMessage: null }
}
