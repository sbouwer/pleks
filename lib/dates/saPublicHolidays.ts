// SA public holidays for business day calculations (CPA s14 notice deadlines)

export const SA_PUBLIC_HOLIDAYS_2025 = [
  "2025-01-01", // New Year's Day
  "2025-03-21", // Human Rights Day
  "2025-04-18", // Good Friday
  "2025-04-21", // Family Day
  "2025-04-27", // Freedom Day (observed Mon)
  "2025-04-28", // Freedom Day
  "2025-05-01", // Workers' Day
  "2025-06-16", // Youth Day
  "2025-08-09", // National Women's Day (observed Sat)
  "2025-09-24", // Heritage Day
  "2025-12-16", // Day of Reconciliation
  "2025-12-25", // Christmas Day
  "2025-12-26", // Day of Goodwill
]

export const SA_PUBLIC_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-03-21", // Human Rights Day (observed Mon)
  "2026-03-23", // Human Rights Day (observed Mon)
  "2026-04-03", // Good Friday
  "2026-04-06", // Family Day
  "2026-04-27", // Freedom Day
  "2026-05-01", // Workers' Day
  "2026-06-16", // Youth Day
  "2026-08-09", // National Women's Day
  "2026-08-10", // Observed
  "2026-09-24", // Heritage Day
  "2026-12-16", // Day of Reconciliation
  "2026-12-25", // Christmas Day
  "2026-12-26", // Day of Goodwill
]

export const SA_PUBLIC_HOLIDAYS_2027 = [
  "2027-01-01", // New Year's Day
  "2027-03-21", // Human Rights Day
  "2027-03-26", // Good Friday
  "2027-03-29", // Family Day
  "2027-04-27", // Freedom Day
  "2027-05-01", // Workers' Day (observed Mon)
  "2027-05-03", // Workers' Day
  "2027-06-16", // Youth Day
  "2027-08-09", // National Women's Day
  "2027-09-24", // Heritage Day
  "2027-12-16", // Day of Reconciliation
  "2027-12-25", // Christmas Day (observed Mon)
  "2027-12-27", // Christmas Day
  "2027-12-26", // Day of Goodwill
]

const ALL_HOLIDAYS = new Set([
  ...SA_PUBLIC_HOLIDAYS_2025,
  ...SA_PUBLIC_HOLIDAYS_2026,
  ...SA_PUBLIC_HOLIDAYS_2027,
])

export function isPublicHoliday(dateStr: string): boolean {
  return ALL_HOLIDAYS.has(dateStr)
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay()
  if (day === 0 || day === 6) return false
  const dateStr = date.toISOString().split("T")[0]
  return !isPublicHoliday(dateStr)
}

export function subtractBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let remaining = days
  while (remaining > 0) {
    result.setDate(result.getDate() - 1)
    if (isBusinessDay(result)) remaining--
  }
  return result
}

export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let remaining = days
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    if (isBusinessDay(result)) remaining--
  }
  return result
}
