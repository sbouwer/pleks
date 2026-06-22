/**
 * lib/extraction/pdfDecrypt.ts — decrypt an "encrypted" PDF to plain text (server-side, no AI).
 *
 * Most SA bank/credit statements ship encrypted with an EMPTY user password + an owner (permissions) password —
 * they open with no prompt but Claude's native PDF support can't read the encrypted bytes. pdf-parse (pdfjs,
 * Apache-licensed, already a dependency) decrypts the empty-password case and yields text, which we feed Claude
 * as a text document block instead of rejecting the upload. A genuinely password-locked PDF (non-empty user
 * password) throws PasswordException → reported as password-required so the result can prompt for an unlocked copy.
 */
import { PDFParse } from "pdf-parse"

export type PdfDecryptResult =
  | { ok: true; text: string }
  | { ok: false; reason: "password-required" | "failed" }

export async function decryptProtectedPdf(bytes: Uint8Array): Promise<PdfDecryptResult> {
  let parser: PDFParse | null = null
  try {
    parser = new PDFParse({ data: bytes })
    const result = await parser.getText()
    const text = (result?.text ?? "").trim()
    if (!text) return { ok: false, reason: "failed" }
    return { ok: true, text }
  } catch (err) {
    const name = err instanceof Error ? err.name : ""
    const msg = err instanceof Error ? err.message : String(err)
    if (name === "PasswordException" || /password/i.test(msg)) return { ok: false, reason: "password-required" }
    return { ok: false, reason: "failed" }
  } finally {
    await parser?.destroy().catch(() => {})
  }
}
