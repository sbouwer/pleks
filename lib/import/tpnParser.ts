import type { ParsedRow } from "./csvParser"

// TPN RentBook column name → Pleks field mapping
const TPN_COLUMN_MAP: Record<string, string | null> = {
  "full_name": null, // split into first_name + last_name
  "mobile_number": "phone",
  "email_address": "email",
  "id_number": "id_number",
  "property_name": "property_name",
  "unit_name": "unit_number",
  "monthly_rent": "monthly_rent_cents",
  "lease_start_date": "lease_start",
  "lease_end_date": "lease_end",
}

export function convertTpnRow(row: ParsedRow): ParsedRow {
  const converted: ParsedRow = {}

  for (const [tpnKey, pleksKey] of Object.entries(TPN_COLUMN_MAP)) {
    const value = row[tpnKey] ?? ""

    if (tpnKey === "full_name") {
      const parts = value.split(" ")
      converted.first_name = parts[0] ?? ""
      converted.last_name = parts.slice(1).join(" ") || parts[0] || ""
      continue
    }

    if (tpnKey === "monthly_rent" && value) {
      // Convert "R 6,600.00" or "6600" to cents
      const cleaned = value.replace(/[R\s,]/g, "")
      const rands = parseFloat(cleaned)
      converted.monthly_rent_cents = isNaN(rands) ? "0" : String(Math.round(rands * 100))
      continue
    }

    if ((tpnKey === "lease_start_date" || tpnKey === "lease_end_date") && value) {
      // Convert DD/MM/YYYY → YYYY-MM-DD
      const parts = value.split("/")
      if (parts.length === 3) {
        converted[pleksKey!] = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`
        continue
      }
    }

    if (pleksKey) {
      converted[pleksKey] = value
    }
  }

  // Copy any unmapped columns through
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, "_")
    if (!TPN_COLUMN_MAP[normalizedKey] && !converted[normalizedKey]) {
      converted[normalizedKey] = value
    }
  }

  return converted
}

export function convertTpnExport(rows: ParsedRow[]): ParsedRow[] {
  return rows.map(convertTpnRow)
}
