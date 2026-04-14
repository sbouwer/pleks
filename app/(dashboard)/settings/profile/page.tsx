import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { ProfileForm, type OrgDetails } from "./ProfileForm"

const SELECT_FIELDS = [
  "id", "type", "user_type", "primary_contact_is_user",
  "name", "trading_as", "reg_number", "eaab_number", "vat_number",
  "email", "phone", "address", "website",
  "title", "first_name", "last_name", "initials", "gender",
  "date_of_birth", "id_number", "mobile",
  "addr_type", "addr_line1", "addr_suburb", "addr_city", "addr_province", "addr_postal_code",
  "addr2_type", "addr2_line1", "addr2_suburb", "addr2_city", "addr2_province", "addr2_postal_code",
].join(", ")

export default async function ProfilePage() {
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
  let type: OrgDetails["type"] = "agency"
  if (d.type === "landlord" || d.user_type === "owner") type = "landlord"
  else if (d.type === "sole_prop") type = "sole_prop"

  const initialData: OrgDetails = {
    id: d.id as string,
    type,
    primary_contact_is_user: typeof d.primary_contact_is_user === "boolean" ? d.primary_contact_is_user : true,
    name: (d.name as string) ?? null,
    trading_as: (d.trading_as as string) ?? null,
    reg_number: (d.reg_number as string) ?? null,
    eaab_number: (d.eaab_number as string) ?? null,
    vat_number: (d.vat_number as string) ?? null,
    email: (d.email as string) ?? null,
    phone: (d.phone as string) ?? null,
    address: (d.address as string) ?? null,
    website: (d.website as string) ?? null,
    title: (d.title as string) ?? null,
    first_name: (d.first_name as string) ?? null,
    last_name: (d.last_name as string) ?? null,
    initials: (d.initials as string) ?? null,
    gender: (d.gender as string) ?? null,
    date_of_birth: (d.date_of_birth as string) ?? null,
    id_number: (d.id_number as string) ?? null,
    mobile: (d.mobile as string) ?? null,
    addr_type: (d.addr_type as string) ?? null,
    addr_line1: (d.addr_line1 as string) ?? null,
    addr_suburb: (d.addr_suburb as string) ?? null,
    addr_city: (d.addr_city as string) ?? null,
    addr_province: (d.addr_province as string) ?? null,
    addr_postal_code: (d.addr_postal_code as string) ?? null,
    addr2_type: (d.addr2_type as string) ?? null,
    addr2_line1: (d.addr2_line1 as string) ?? null,
    addr2_suburb: (d.addr2_suburb as string) ?? null,
    addr2_city: (d.addr2_city as string) ?? null,
    addr2_province: (d.addr2_province as string) ?? null,
    addr2_postal_code: (d.addr2_postal_code as string) ?? null,
    office_hours_weekday: (d.office_hours_weekday as string) ?? null,
    office_hours_saturday: (d.office_hours_saturday as string) ?? null,
    office_hours_sunday: (d.office_hours_sunday as string) ?? null,
    office_hours_public_holidays: (d.office_hours_public_holidays as string) ?? null,
    emergency_phone: (d.emergency_phone as string) ?? null,
    emergency_contact_name: (d.emergency_contact_name as string) ?? null,
    emergency_instructions: (d.emergency_instructions as string) ?? null,
    emergency_email: (d.emergency_email as string) ?? null,
  }

  return <ProfileForm initialData={initialData} />
}
