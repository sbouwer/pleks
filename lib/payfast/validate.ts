import { generatePayFastSignature } from "./signature"
import { PAYFAST_CONFIG } from "./config"

export async function validatePayFastITN(
  params: Record<string, string>,
  rawBody: string
): Promise<{ valid: boolean; error?: string }> {
  // 1. Check payment status
  if (params.payment_status !== "COMPLETE") {
    return { valid: false, error: "Payment not complete" }
  }

  // 2. Verify signature
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
