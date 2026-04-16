import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { HoursForm } from "./HoursForm"

const SELECT_FIELDS = [
  "office_hours_monday", "office_hours_tuesday", "office_hours_wednesday", "office_hours_thursday", "office_hours_friday",
  "office_hours_saturday", "office_hours_sunday", "office_hours_public_holidays",
  "emergency_phone", "emergency_contact_name", "emergency_instructions", "emergency_email",
].join(", ")

export default async function HoursPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const supabase = await createClient()
  const { data: org } = await supabase
    .from("organisations")
    .select(SELECT_FIELDS)
    .eq("id", membership.org_id)
    .single()

  if (!org) redirect("/login")

  const d = org as unknown as Record<string, unknown>

  return (
    <HoursForm
      initialData={{
        office_hours_monday: (d.office_hours_monday as string) ?? null,
        office_hours_tuesday: (d.office_hours_tuesday as string) ?? null,
        office_hours_wednesday: (d.office_hours_wednesday as string) ?? null,
        office_hours_thursday: (d.office_hours_thursday as string) ?? null,
        office_hours_friday: (d.office_hours_friday as string) ?? null,
        office_hours_saturday: (d.office_hours_saturday as string) ?? null,
        office_hours_sunday: (d.office_hours_sunday as string) ?? null,
        office_hours_public_holidays: (d.office_hours_public_holidays as string) ?? null,
        emergency_phone: (d.emergency_phone as string) ?? null,
        emergency_contact_name: (d.emergency_contact_name as string) ?? null,
        emergency_instructions: (d.emergency_instructions as string) ?? null,
        emergency_email: (d.emergency_email as string) ?? null,
      }}
    />
  )
}
