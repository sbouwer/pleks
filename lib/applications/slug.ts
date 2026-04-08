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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  const suffix = Math.random().toString(36).substring(2, 6)
  return `${base}-${suffix}`
}
