export type PropertyType = "residential" | "commercial" | "mixed"

export function getVisibleFields(propertyType: PropertyType) {
  const isCommercial = propertyType === "commercial"
  return {
    bedrooms: !isCommercial,
    bathrooms: !isCommercial,
    size_m2: true,
    floor: true,
    parking_bays: true,
    furnished: !isCommercial,
    sizePrimary: isCommercial,
  }
}

export function getUnitDescription(
  unit: { bedrooms?: number | null; bathrooms?: number | null; size_m2?: number | null; floor?: number | null; parking_bays?: number | null },
  propertyType: string
): string {
  if (propertyType === "commercial") {
    const parts: string[] = []
    if (unit.size_m2) parts.push(`${unit.size_m2} m²`)
    if (unit.floor != null) parts.push(unit.floor === 0 ? "Ground floor" : `Floor ${unit.floor}`)
    if (unit.parking_bays) parts.push(`${unit.parking_bays} parking`)
    return parts.join(" · ") || "No details"
  }
  const parts: string[] = []
  if (unit.bedrooms != null) parts.push(`${unit.bedrooms} bed`)
  if (unit.bathrooms != null) parts.push(`${unit.bathrooms} bath`)
  if (unit.size_m2) parts.push(`${unit.size_m2} m²`)
  return parts.join(" · ") || "No details"
}
