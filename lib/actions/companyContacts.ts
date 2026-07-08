"use server"

/**
 * lib/actions/companyContacts.ts — add / remove a person under a company contact (ADDENDUM_25A §6)
 *
 * Auth:   requireAgentWriteAccess (agent write gate + subscription lockdown)
 * Data:   contacts (the person is a first-class contact with organisation_contact_id + company_contact role)
 * Notes:  Drives the detail-page People section's inline manage. A signatory needs a valid FICA ID (Luhn
 *         for SA ID; passport/permit accepted). Making a person primary unsets the others; removing the
 *         primary promotes another remaining person so the "exactly one primary" invariant holds.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { idNumberColumns } from "@/lib/crypto/idNumber"
import { validateSAId } from "@/lib/parties/partyValidation"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface AddCompanyPersonInput {
  companyContactId: string
  firstName?: string
  lastName?: string
  companyFunction?: string
  designation?: string
  email?: string
  phone?: string
  isPrimary?: boolean
  isSignatory?: boolean
  idType?: string
  idNumber?: string
}

function signatoryIdError(input: AddCompanyPersonInput): string | null {
  if (!input.isSignatory) return null
  const id = input.idNumber?.trim()
  if (!id) return "A signatory needs an ID number (FICA)."
  if ((input.idType || "sa_id") === "sa_id") {
    const v = validateSAId(id)
    if (v && !v.valid) return "Invalid SA ID number."
  }
  return null
}

export async function addCompanyPerson(input: AddCompanyPersonInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const { db, userId, orgId } = await requireAgentWriteAccess("add_company_person")

    if (!input.firstName?.trim() && !input.lastName?.trim()) return { ok: false, error: "A first or last name is required." }
    const idErr = signatoryIdError(input)
    if (idErr) return { ok: false, error: idErr }

    const { data: company, error: companyError } = await db
      .from("contacts").select("id, entity_type").eq("id", input.companyContactId).eq("org_id", orgId).single()
    logQueryError("addCompanyPerson contacts", companyError)
    if (!company) return { ok: false, error: "Company not found." }
    if (company.entity_type !== "organisation") return { ok: false, error: "Only a company contact can have people." }

    // Making this person primary clears any existing primary (the partial-unique index allows only one).
    if (input.isPrimary) {
      await db.from("contacts").update({ is_primary_contact: false })
        .eq("organisation_contact_id", input.companyContactId).eq("org_id", orgId)
    }

    const sigId = input.isSignatory ? (input.idNumber?.trim() || null) : null
    const { error } = await db.from("contacts").insert({
      org_id: orgId,
      entity_type: "individual",
      primary_role: "company_contact",
      organisation_contact_id: input.companyContactId,
      company_function: input.companyFunction || "other",
      designation: input.designation?.trim() || null,
      is_primary_contact: !!input.isPrimary,
      is_signatory: !!input.isSignatory,
      id_type: input.isSignatory ? (input.idType || "sa_id") : null,
      ...idNumberColumns(sigId),
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      primary_email: input.email?.trim() || null,
      primary_phone: input.phone?.trim() || null,
      created_by: userId,
    })
    if (error) { console.error("addCompanyPerson:", error.message); return { ok: false, error: "Failed to add the person." } }
    return { ok: true }
  } catch (e) {
    console.error("addCompanyPerson failed:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add the person." }
  }
}

export async function removeCompanyPerson(input: { personId: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const { db, orgId } = await requireAgentWriteAccess("remove_company_person")

    const { data: person, error: personError } = await db
      .from("contacts").select("id, organisation_contact_id, is_primary_contact")
      .eq("id", input.personId).eq("org_id", orgId).eq("primary_role", "company_contact").single()
    logQueryError("removeCompanyPerson contacts", personError)
    if (!person?.organisation_contact_id) return { ok: false, error: "Person not found." }

    await db.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", input.personId).eq("org_id", orgId)

    // Removing the primary → promote another remaining person so exactly one primary survives.
    if (person.is_primary_contact) {
      const { data: remaining, error: remainingError } = await db
        .from("contacts").select("id")
        .eq("organisation_contact_id", person.organisation_contact_id).eq("org_id", orgId)
        .is("deleted_at", null).limit(1)
        logQueryError("removeCompanyPerson contacts", remainingError)
      if (remaining?.[0]) {
        await db.from("contacts").update({ is_primary_contact: true }).eq("id", remaining[0].id).eq("org_id", orgId)
      }
    }
    return { ok: true }
  } catch (e) {
    console.error("removeCompanyPerson failed:", e instanceof Error ? e.message : e)
    return { ok: false, error: e instanceof Error ? e.message : "Failed to remove the person." }
  }
}
