/**
 * lib/payfast/config.ts — PayFast merchant configuration (sandbox vs live)
 */
import { PAYFAST_SANDBOX_PUBLIC, optionalEnv } from "@/lib/env"
const isSandbox = PAYFAST_SANDBOX_PUBLIC

export const PAYFAST_CONFIG = {
  merchantId: isSandbox
    ? optionalEnv("PAYFAST_MERCHANT_ID_TEST")
    : optionalEnv("PAYFAST_MERCHANT_ID_LIVE"),
  merchantKey: isSandbox
    ? optionalEnv("PAYFAST_MERCHANT_KEY_TEST")
    : optionalEnv("PAYFAST_MERCHANT_KEY_LIVE"),
  passphrase: isSandbox
    ? optionalEnv("PAYFAST_PASSPHRASE_TEST", "")
    : optionalEnv("PAYFAST_PASSPHRASE_LIVE", ""),
  isSandbox,
  processUrl: isSandbox
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process",
  validateUrl: isSandbox
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate",
}
