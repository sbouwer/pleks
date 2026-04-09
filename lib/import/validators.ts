import type { ParsedRow, ParseError } from "./csvParser"
import { SA_PROVINCES } from "@/lib/constants"

export function validatePropertyRow(row: ParsedRow, index: number): ParseError[] {
  const errors: ParseError[] = []
  const rowNum = index + 2

  if (!row.property_name?.trim()) {
    errors.push({ row: rowNum, field: "property_name", message: "Property name is required" })
  }
  if (!row.address_line1?.trim()) {
    errors.push({ row: rowNum, field: "address_line1", message: "Address is required" })
  }
  if (!row.city?.trim()) {
    errors.push({ row: rowNum, field: "city", message: "City is required" })
  }
  if (row.province && !SA_PROVINCES.includes(row.province as typeof SA_PROVINCES[number])) {
    errors.push({ row: rowNum, field: "province", message: `Invalid province: "${row.province}"`, severity: "warning" })
  }
  if (!row.unit_number?.trim()) {
    errors.push({ row: rowNum, field: "unit_number", message: "Unit number is required" })
  }

  return errors
}

export function validateTenantRow(row: ParsedRow, index: number): ParseError[] {
  const errors: ParseError[] = []
  const rowNum = index + 2

  if (!row.first_name?.trim()) {
    errors.push({ row: rowNum, field: "first_name", message: "First name is required" })
  }
  if (!row.last_name?.trim()) {
    errors.push({ row: rowNum, field: "last_name", message: "Last name is required" })
  }
  if (!row.email?.trim()) {
    errors.push({ row: rowNum, field: "email", message: "Email is required" })
  } else if (!/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/.test(row.email)) {
    errors.push({ row: rowNum, field: "email", message: "Invalid email format" })
  }

  if (row.id_type && !["sa_id", "passport", "asylum_permit"].includes(row.id_type)) {
    errors.push({ row: rowNum, field: "id_type", message: `Invalid ID type: "${row.id_type}"`, severity: "warning" })
  }

  return errors
}

export const VALID_EMPLOYMENT_TYPES = [
  "employed",
  "self_employed",
  "unemployed",
  "retired",
  "student",
  "contractor",
  "freelance",
  "government",
  "part_time",
] as const

/**
 * Validate a South African ID number using the Luhn algorithm.
 * SA ID numbers are 13 digits: YYMMDD SSSS C A Z
 */
export function validateSAID(idNumber: string): boolean {
  const cleaned = idNumber.replaceAll(/\s/g, "")

  if (!/^\d{13}$/.test(cleaned)) return false

  // Luhn check
  let sum = 0
  for (let i = 0; i < 13; i++) {
    let digit = Number.parseInt(cleaned[i], 10)

    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }

    sum += digit
  }

  return sum % 10 === 0
}

/**
 * Basic email format validation.
 */
export function validateEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}$/.test(email.trim())
}

export function normaliseBranchCode(raw: string | null): string | null {
  if (!raw) return null
  const match = /\((\d+)\)/.exec(raw)
  if (match) return match[1]
  if (/^\d+$/.test(raw.trim())) return raw.trim()
  return raw
}

export function validateLeaseRow(row: ParsedRow, index: number): ParseError[] {
  const errors: ParseError[] = []
  const rowNum = index + 2

  if (!row.tenant_email?.trim()) {
    errors.push({ row: rowNum, field: "tenant_email", message: "Tenant email is required (used to match tenant)" })
  }
  if (!row.unit_address?.trim()) {
    errors.push({ row: rowNum, field: "unit_address", message: "Unit address is required (used to match unit)" })
  }
  if (!row.lease_start?.trim()) {
    errors.push({ row: rowNum, field: "lease_start", message: "Lease start date is required" })
  } else if (Number.isNaN(Date.parse(row.lease_start))) {
    errors.push({ row: rowNum, field: "lease_start", message: "Invalid date format (use YYYY-MM-DD)" })
  }
  if (!row.monthly_rent_cents?.trim()) {
    errors.push({ row: rowNum, field: "monthly_rent_cents", message: "Monthly rent is required (in cents)" })
  }

  return errors
}
