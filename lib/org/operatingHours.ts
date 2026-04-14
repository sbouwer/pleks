export interface OperatingHours {
  weekday: string
  saturday: string | null
  sunday: string | null
  publicHolidays: string | null
  emergencyPhone: string | null
  emergencyContactName: string | null
  emergencyEmail: string | null
  emergencyInstructions: string | null
}

export interface OrgHoursRecord {
  phone?: string | null
  office_hours_weekday?: string | null
  office_hours_saturday?: string | null
  office_hours_sunday?: string | null
  office_hours_public_holidays?: string | null
  emergency_phone?: string | null
  emergency_contact_name?: string | null
  emergency_email?: string | null
  emergency_instructions?: string | null
}

export function getOperatingHours(org: OrgHoursRecord): OperatingHours {
  return {
    weekday: org.office_hours_weekday ?? "Mon–Fri 08:00–17:00",
    saturday: org.office_hours_saturday ?? null,
    sunday: org.office_hours_sunday ?? null,
    publicHolidays: org.office_hours_public_holidays ?? null,
    emergencyPhone: org.emergency_phone ?? org.phone ?? null,
    emergencyContactName: org.emergency_contact_name ?? null,
    emergencyEmail: org.emergency_email ?? null,
    emergencyInstructions: org.emergency_instructions ?? null,
  }
}

export function formatOfficeHours(hours: OperatingHours): string {
  const parts = [hours.weekday]
  if (hours.saturday) parts.push(`Sat ${hours.saturday}`)
  if (hours.sunday) parts.push(`Sun ${hours.sunday}`)
  return parts.join(" | ")
}

export function formatEmergencyLine(hours: OperatingHours): string {
  if (!hours.emergencyPhone) return ""
  const name = hours.emergencyContactName ? ` (${hours.emergencyContactName})` : ""
  return `${hours.emergencyPhone}${name}`
}
