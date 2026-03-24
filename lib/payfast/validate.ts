import { generatePayFastSignature } from "./signature"

const PAYFAST_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate"
const PAYFAST_SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate"

export async function validatePayFastITN(
  params: Record<string, string>,
  rawBody: string
): Promise<{ valid: boolean; error?: string }> {
  // 1. Check payment status
  if (params.payment_status !== "COMPLETE") {
    return { valid: false, error: "Payment not complete" }
  }

  // 2. Verify signature
  const passphrase = process.env.PAYFAST_PASSPHRASE
  const expectedSignature = generatePayFastSignature(params, passphrase)

  if (expectedSignature !== params.signature) {
    return { valid: false, error: "Signature mismatch" }
  }

  // 3. Server-to-server validation
  const isSandbox = process.env.NEXT_PUBLIC_PAYFAST_SANDBOX === "true"
  const validateUrl = isSandbox ? PAYFAST_SANDBOX_VALIDATE_URL : PAYFAST_VALIDATE_URL

  try {
    const response = await fetch(validateUrl, {
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
    if (!isSandbox) {
      return { valid: false, error: "PayFast validation request failed" }
    }
  }

  return { valid: true }
}
