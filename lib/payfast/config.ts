const isSandbox = process.env.NEXT_PUBLIC_PAYFAST_SANDBOX === "true"

export const PAYFAST_CONFIG = {
  merchantId: isSandbox
    ? process.env.PAYFAST_MERCHANT_ID_TEST!
    : process.env.PAYFAST_MERCHANT_ID_LIVE!,
  merchantKey: isSandbox
    ? process.env.PAYFAST_MERCHANT_KEY_TEST!
    : process.env.PAYFAST_MERCHANT_KEY_LIVE!,
  passphrase: isSandbox
    ? process.env.PAYFAST_PASSPHRASE_TEST || ""
    : process.env.PAYFAST_PASSPHRASE_LIVE || "",
  isSandbox,
  processUrl: isSandbox
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process",
  validateUrl: isSandbox
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate",
}
