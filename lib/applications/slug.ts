/**
 * Listing URL slug generation.
 * Format: {property-name}-{unit-number}-{city}-{4-char-suffix}
 * e.g. "boegoe-apartment-flatlet-paarl-x7k2"
 */

export function generateListingSlug(
  propertyName: string,
  unitNumber: string,
  city: string
): string {
  const base = [propertyName, unitNumber, city]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")

  const bytes = crypto.getRandomValues(new Uint8Array(2))
  const suffix = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
  return `${base}-${suffix}`
}
