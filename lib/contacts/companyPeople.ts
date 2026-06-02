/**
 * lib/contacts/companyPeople.ts — fetch the people under a company contact (ADDENDUM_25A)
 *
 * Data:   contacts WHERE organisation_contact_id = <company contact>, primary first
 * Notes:  Server-side helper for the detail-page People section. Sub-people are first-class contacts;
 *         this is the only place that enumerates them on purpose (scoped to one company), so the §9
 *         top-level filter does NOT apply here.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface CompanyPerson {
  id: string
  name: string
  companyFunction: string | null
  designation: string | null
  isPrimary: boolean
  isSignatory: boolean
  phone: string | null
  email: string | null
}

export async function fetchCompanyPeople(
  db: SupabaseClient, orgId: string, companyContactId: string,
): Promise<CompanyPerson[]> {
  const { data, error } = await db
    .from("contacts")
    .select("id, first_name, last_name, company_function, designation, is_primary_contact, is_signatory, primary_email, primary_phone")
    .eq("org_id", orgId)
    .eq("organisation_contact_id", companyContactId)
    .is("deleted_at", null)
    .order("is_primary_contact", { ascending: false })

  if (error) {
    console.error("fetchCompanyPeople:", error.message)
    return []
  }

  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Contact",
    companyFunction: (p.company_function as string | null) ?? null,
    designation: (p.designation as string | null) ?? null,
    isPrimary: !!p.is_primary_contact,
    isSignatory: !!p.is_signatory,
    phone: (p.primary_phone as string | null) ?? null,
    email: (p.primary_email as string | null) ?? null,
  }))
}
