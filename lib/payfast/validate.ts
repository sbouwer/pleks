/**
 * lib/payfast/validate.ts — PayFast ITN signature + server-side validation
 *
 * Data:   PayFast ITN params; server-to-server validation against PayFast's validate endpoint
 * Notes:  Does NOT check payment_status — callers decide which statuses to accept.
 *         In sandbox mode, server-to-server validation failure is swallowed (endpoint unreliable).
 */
import { generatePayFastSignature } from "./signature"
import { PAYFAST_CONFIG } from "./config"

export async function validatePayFastITN(
  params: Record<string, string>,
  rawBody: string
): Promise<{ valid: boolean; error?: string }> {
  // 1. Verify signature
  const expectedSignature = generatePayFastSignature(params, PAYFAST_CONFIG.passphrase)

  if (expectedSignature !== params.signature) {
    return { valid: false, error: "Signature mismatch" }
  }

  // 3. Server-to-server validation
  try {
    const response = await fetch(PAYFAST_CONFIG.validateUrl, {
      method: "POST",
      body: rawBody,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
    const result = await response.text()

    if (result !== "VALID") {
      return { valid: false, error: "PayFast server validation failed" }
    }
  } catch {
    // In sandbox, validation endpoint may not always respond
    if (!PAYFAST_CONFIG.isSandbox) {
      return { valid: false, error: "PayFast validation request failed" }
    }
  }

  return { valid: true }
}
