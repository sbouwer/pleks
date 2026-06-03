/**
 * lib/contacts/resolveCompanyContact.ts — route a comm to the right person under a company contact (25A §3)
 *
 * Data:   contacts (people under organisation_contact_id) + the company contact's general channel
 * Notes:  Purpose → function-person → primary person → company-general channel. NULL-SAFE (the 60C/FIX-70
 *         empty-recipient lesson): returns the first candidate that actually has an email OR phone; if
 *         NONE is contactable it logs loudly and returns null so the caller can refuse to send — never a
 *         blank recipient. Individual (non-company) contacts have no people; callers use the row directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type CommPurpose = "maintenance" | "statement" | "general"

export interface ResolvedRecipient {
  contactId: string
  name: string
  email: string | null
  phone: string | null
  /** which tier of the chain produced this recipient — useful for logging/debugging routing. */
  source: "function" | "primary" | "company"
}

/** purpose → the company_function that should receive it (null = route to the primary person). */
const PURPOSE_FUNCTION: Record<CommPurpose, string | null> = {
  maintenance: "maintenance",
  statement: "accounts",
  general: null,
}

interface PersonRow {
  id: string
  first_name: string | null
  last_name: string | null
  company_function: string | null
  is_primary_contact: boolean | null
  primary_email: string | null
  primary_phone: string | null
}

function personName(p: PersonRow): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Contact"
}

/** Which channel the comm needs — so we route to a person who actually has it (not just "has any channel"). */
export type CommChannel = "email" | "phone" | "any"

function contactable(email: string | null, phone: string | null, channel: CommChannel): boolean {
  if (channel === "email") return !!email?.trim()
  if (channel === "phone") return !!phone?.trim()
  return !!(email?.trim() || phone?.trim())
}

/**
 * Resolve the recipient for a comm to a company contact. Returns null (and logs) only when nothing in the
 * chain has the requested channel — the caller MUST treat null as "do not send" (or fall back to its own
 * lookup). `channel` defaults to "email" (most company comms are email).
 */
export async function resolveCompanyContact(
  db: SupabaseClient, orgId: string, companyContactId: string, purpose: CommPurpose, channel: CommChannel = "email",
): Promise<ResolvedRecipient | null> {
  const [companyRes, peopleRes] = await Promise.all([
    db.from("contacts")
      .select("id, company_name, first_name, last_name, primary_email, primary_phone")
      .eq("id", companyContactId).eq("org_id", orgId).single(),
    db.from("contacts")
      .select("id, first_name, last_name, company_function, is_primary_contact, primary_email, primary_phone")
      .eq("organisation_contact_id", companyContactId).eq("org_id", orgId).is("deleted_at", null),
  ])

  if (companyRes.error) {
    console.error("resolveCompanyContact company:", companyRes.error.message)
    return null
  }
  const people = (peopleRes.data ?? []) as PersonRow[]

  // 1) Function-specific person (if this purpose has a target function), first with the channel.
  const targetFn = PURPOSE_FUNCTION[purpose]
  if (targetFn) {
    const fnPerson = people.find((p) => p.company_function === targetFn && contactable(p.primary_email, p.primary_phone, channel))
    if (fnPerson) {
      return { contactId: fnPerson.id, name: personName(fnPerson), email: fnPerson.primary_email, phone: fnPerson.primary_phone, source: "function" }
    }
  }

  // 2) Primary person.
  const primary = people.find((p) => p.is_primary_contact && contactable(p.primary_email, p.primary_phone, channel))
  if (primary) {
    return { contactId: primary.id, name: personName(primary), email: primary.primary_email, phone: primary.primary_phone, source: "primary" }
  }

  // 3) Company-general channel (the org row itself).
  const company = companyRes.data
  if (contactable(company.primary_email as string | null, company.primary_phone as string | null, channel)) {
    const name = (company.company_name as string | null)
      ?? [company.first_name, company.last_name].filter(Boolean).join(" ").trim()
      ?? "Company"
    return { contactId: company.id as string, name, email: (company.primary_email as string | null) ?? null, phone: (company.primary_phone as string | null) ?? null, source: "company" }
  }

  // Nothing contactable anywhere — log loudly; the caller must not send to a blank recipient.
  console.error(`resolveCompanyContact: no ${channel} recipient for company ${companyContactId} (purpose=${purpose})`)
  return null
}
