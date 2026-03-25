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
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push({ row: rowNum, field: "email", message: "Invalid email format" })
  }

  if (row.id_type && !["sa_id", "passport", "asylum_permit"].includes(row.id_type)) {
    errors.push({ row: rowNum, field: "id_type", message: `Invalid ID type: "${row.id_type}"`, severity: "warning" })
  }

  return errors
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
  } else if (isNaN(Date.parse(row.lease_start))) {
    errors.push({ row: rowNum, field: "lease_start", message: "Invalid date format (use YYYY-MM-DD)" })
  }
  if (!row.monthly_rent_cents?.trim()) {
    errors.push({ row: rowNum, field: "monthly_rent_cents", message: "Monthly rent is required (in cents)" })
  }

  return errors
}
