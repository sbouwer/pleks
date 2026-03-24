import { createHash } from "crypto"

export function hashIdNumber(idNumber: string): string {
  const normalised = idNumber.replace(/\s/g, "").toUpperCase()
  const salt = process.env.ID_NUMBER_HASH_SALT || "pleks-default-salt"
  return createHash("sha256").update(normalised + salt).digest("hex")
}

export function validateSAIdNumber(id: string): {
  valid: boolean
  dob?: Date
  gender?: "male" | "female"
  citizenship?: "sa_citizen" | "permanent_resident"
} {
  const clean = id.replace(/\s/g, "")
  if (!/^\d{13}$/.test(clean)) return { valid: false }

  const year = parseInt(clean.slice(0, 2))
  const month = parseInt(clean.slice(2, 4))
  const day = parseInt(clean.slice(4, 6))
  const currentYearShort = new Date().getFullYear() % 100
  const fullYear = year <= currentYearShort ? 2000 + year : 1900 + year
  const dob = new Date(fullYear, month - 1, day)

  if (isNaN(dob.getTime()) || month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false }
  }

  const genderCode = parseInt(clean.slice(6, 10))
  const gender = genderCode < 5000 ? "female" : "male"
  const citizenship = clean[10] === "0" ? "sa_citizen" : "permanent_resident"

  // Luhn check
  let sum = 0
  for (let i = 0; i < 12; i++) {
    let digit = parseInt(clean[i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  const checkDigit = (10 - (sum % 10)) % 10
  const valid = checkDigit === parseInt(clean[12])

  return { valid, dob, gender, citizenship }
}

export function maskIdNumber(idNumber: string): string {
  if (!idNumber) return "—"
  const clean = idNumber.replace(/\s/g, "")
  if (clean.length === 13) {
    return `${clean.slice(0, 4)}•••••••${clean.slice(9)}`
  }
  if (clean.length > 5) {
    return `${clean.slice(0, 2)}${"•".repeat(clean.length - 5)}${clean.slice(-3)}`
  }
  return "••••"
}
