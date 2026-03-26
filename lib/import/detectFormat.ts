/** TPN-specific column names that indicate a TPN RentBook export */
const TPN_INDICATORS = [
  "tpn ref",
  "tpn reference",
  "credit score",
  "tenant code",
  "tpn tenant code",
  "payment profile",
  "tpn status",
  "arrears amount",
  "full name",
  "mobile number",
  "email address",
  "unit name",
  "monthly rent",
  "lease start date",
  "lease end date",
]

/**
 * Detect whether the file headers indicate a TPN RentBook export format.
 * Returns true if at least 3 TPN-specific columns are found.
 */
export function isTpnFormat(headers: string[]): boolean {
  const normalised = headers.map((h) => h.toLowerCase().trim())
  const matches = TPN_INDICATORS.filter((indicator) => normalised.includes(indicator))
  return matches.length >= 3
}
