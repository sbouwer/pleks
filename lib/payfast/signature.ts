import { createHash } from "crypto"

export function generatePayFastSignature(
  data: Record<string, string>,
  passphrase?: string
): string {
  const sortedKeys = Object.keys(data)
    .filter((key) => key !== "signature" && data[key] !== "")
    .sort()

  const queryString = sortedKeys
    .map((key) => `${key}=${encodeURIComponent(data[key]).replace(/%20/g, "+")}`)
    .join("&")

  const withPassphrase = passphrase
    ? `${queryString}&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`
    : queryString

  return createHash("md5").update(withPassphrase).digest("hex")
}
