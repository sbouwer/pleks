export interface CoTenantSplit {
  primary: { first_name: string; last_name: string; email: string; phone: string; id_number: string }
  co_tenant: { first_name: string; last_name: string; email: string; phone: string; id_number: string | null }
}

export function detectTpnCoTenant(row: Record<string, string>): CoTenantSplit | null {
  // Look for ampersand in first names or multiple emails
  const firstNames = row["first_name"] || row["first names"] || row["FIRST NAMES"] || ""
  const email = row["email"] || row["EMAIL"] || ""
  const phone = row["phone"] || row["numbers"] || row["NUMBERS"] || ""
  const lastName = row["last_name"] || row["surname"] || row["SURNAME"] || ""
  const idNumber = row["id_number"] || row["identifier"] || row["IDENTIFIER"] || ""

  const hasAmpersand = firstNames.includes(" & ")
  const emails = email.split(",").map((e) => e.trim()).filter(Boolean)
  const phones = phone.split(",").map((p) => p.trim()).filter(Boolean)

  if (!hasAmpersand && emails.length < 2) return null

  const nameParts = firstNames.split(" & ")

  return {
    primary: {
      first_name: nameParts[0]?.trim() || firstNames,
      last_name: lastName,
      email: emails[0] || email,
      phone: phones[0] || phone,
      id_number: idNumber,
    },
    co_tenant: {
      first_name: nameParts[1]?.trim() || "",
      last_name: lastName,
      email: emails[1] || "",
      phone: phones[1] || "",
      id_number: null,
    },
  }
}
