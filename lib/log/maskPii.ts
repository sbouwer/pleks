/**
 * lib/log/maskPii.ts — mask contact PII before it goes into a log line
 *
 * Notes:  console.* output lands in Vercel/Sentry logs (retained, broadly readable) — a raw email/phone there is
 *         PII-at-rest in the log store. Use these when a log line needs to identify a recipient for debugging:
 *         they keep just enough to correlate (domain, last digits) without persisting the full identifier.
 */

/** `jane.doe@acme.co.za` → `j••@acme.co.za`. Non-emails / empty → `••`. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "••"
  const at = email.lastIndexOf("@")
  if (at <= 0) return "••"
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return `${local[0]}••@${domain}`
}

/** `+27821234567` → `••••4567` (last 4). Empty → `••`. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "••"
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : "••"
}
