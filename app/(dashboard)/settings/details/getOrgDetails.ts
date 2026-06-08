/**
 * app/(dashboard)/settings/details/getOrgDetails.ts — load the org's person/contact/address fields
 *
 * Auth:   caller passes the gateway db + orgId
 * Data:   organisations (the personal-identity + contact + address columns)
 * Notes:  Shared loader for the My profile tabs (and, later, the Organisation page). Maps the org row to
 *         the OrgDetails shape the shared sections expect; company-only + hours/emergency fields are
 *         nulled (My profile renders only person/contact/address). Owner/landlord-type → type "landlord".
 */
import type { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import type { OrgDetails } from "./sections"

type Db = Awaited<ReturnType<typeof createServiceClient>>

const SELECT = [
  "id", "type", "user_type", "primary_contact_is_user",
  "email", "phone", "title", "first_name", "last_name", "initials",
  "gender", "date_of_birth", "id_number", "mobile",
  "addr_type", "addr_line1", "addr_suburb", "addr_city", "addr_province", "addr_postal_code",
  "addr2_type", "addr2_line1", "addr2_suburb", "addr2_city", "addr2_province", "addr2_postal_code",
].join(", ")

export async function getOrgDetails(db: Db, orgId: string): Promise<OrgDetails | null> {
  const { data, error } = await db.from("organisations").select(SELECT).eq("id", orgId).maybeSingle()
  logQueryError("getOrgDetails organisations", error)
  if (!data) return null

  const d = data as unknown as Record<string, unknown>
  const s = (k: string) => (d[k] as string) ?? null
  let type: OrgDetails["type"] = "agency"
  if (d.type === "landlord" || d.user_type === "owner") type = "landlord"
  else if (d.type === "sole_prop") type = "sole_prop"

  return {
    id: d.id as string,
    type,
    primary_contact_is_user: typeof d.primary_contact_is_user === "boolean" ? d.primary_contact_is_user : true,
    name: null, trading_as: null, reg_number: null, eaab_number: null, vat_number: null,
    email: s("email"), phone: s("phone"), address: null, website: null,
    title: s("title"), first_name: s("first_name"), last_name: s("last_name"), initials: s("initials"),
    gender: s("gender"), date_of_birth: s("date_of_birth"), id_number: s("id_number"), mobile: s("mobile"),
    addr_type: s("addr_type"), addr_line1: s("addr_line1"), addr_suburb: s("addr_suburb"),
    addr_city: s("addr_city"), addr_province: s("addr_province"), addr_postal_code: s("addr_postal_code"),
    addr2_type: s("addr2_type"), addr2_line1: s("addr2_line1"), addr2_suburb: s("addr2_suburb"),
    addr2_city: s("addr2_city"), addr2_province: s("addr2_province"), addr2_postal_code: s("addr2_postal_code"),
    office_hours_weekday: null, office_hours_saturday: null, office_hours_sunday: null, office_hours_public_holidays: null,
    emergency_phone: null, emergency_contact_name: null, emergency_instructions: null, emergency_email: null,
  }
}
