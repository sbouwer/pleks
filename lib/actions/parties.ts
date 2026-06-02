"use server"

/**
 * lib/actions/parties.ts — create actions for the unified add-party modal
 *
 * Auth:   requireAgentWriteAccess (agent write gate + subscription lockdown)
 * Data:   contacts + the role extension table (contractors; landlords/tenants in a later phase)
 * Notes:  Phase 1 = contractor only. Contractors are not a full-FICA subject, so NO PII (ID number)
 *         is captured/stored — which keeps this free of the encryption path. Landlord/tenant creates
 *         (with id_number + id_number_hash + consent_log) follow the lib/actions/tenants.ts pattern
 *         when they are wired. db is the service client → every write carries org_id explicitly.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { toContactEntityType } from "@/lib/parties/partyConfig"
import type { PartyFormState, AddPartyInput, AddPartyResult } from "@/lib/parties/partyValidation"

function contractorDisplayName(isCompany: boolean, f: PartyFormState): string {
  if (isCompany) return f.companyName?.trim() || "Contractor"
  return [f.firstName, f.lastName].filter(Boolean).join(" ").trim() || "Contractor"
}

/** One contacts row shape (consistent keys for the typed insert). Company stores the registered
 *  entity + its primary-contact person; individual stores the person. */
function buildContractorContactRow(isCompany: boolean, f: PartyFormState, orgId: string, userId: string) {
  return {
    org_id: orgId,
    entity_type: toContactEntityType(isCompany ? "company" : "individual"),
    primary_role: "contractor",
    company_name: isCompany ? f.companyName?.trim() || null : null,
    registration_number: isCompany ? f.companyReg?.trim() || null : null,
    first_name: (isCompany ? f.dirFirstName : f.firstName)?.trim() || null,
    last_name: (isCompany ? f.dirLastName : f.lastName)?.trim() || null,
    primary_email: (isCompany ? f.dirEmail : f.email)?.trim() || null,
    primary_phone: (isCompany ? f.dirPhone : f.phone)?.trim() || null,
    notes: f.notes?.trim() || null,
    created_by: userId,
  }
}

export async function addContractorParty(
  input: AddPartyInput,
  supplierType: string = "contractor",
): Promise<AddPartyResult> {
  if (input.role !== "supplier") return { ok: false, error: "Unsupported role for this action" }

  try {
    const { db, userId, orgId } = await requireAgentWriteAccess("add_contractor")
    const f = input.form
    const isCompany = input.entity === "company"
    const displayName = contractorDisplayName(isCompany, f)
    const contactRow = buildContractorContactRow(isCompany, f, orgId, userId)

    const { data: contact, error: contactErr } = await db.from("contacts").insert(contactRow).select("id").single()
    if (contactErr || !contact) {
      console.error("[addContractorParty] contact insert failed:", contactErr?.message)
      return { ok: false, error: "Failed to create the contact" }
    }

    const { error: conErr } = await db.from("contractors").insert({
      org_id: orgId,
      contact_id: contact.id,
      is_active: f.isActive !== false,
      specialities: f.specialities ?? [],
      supplier_type: supplierType,
    })
    if (conErr) {
      console.error("[addContractorParty] contractor insert failed:", conErr.message)
      await db.from("contacts").delete().eq("id", contact.id).eq("org_id", orgId) // roll back orphan
      return { ok: false, error: "Failed to create the contractor" }
    }

    await db.from("audit_log").insert({
      org_id: orgId,
      table_name: "contractors",
      record_id: contact.id,
      action: "INSERT",
      changed_by: userId,
      new_values: { action: "contractor_added", entity: input.entity },
    })

    return { ok: true, name: displayName }
  } catch (err) {
    console.error("[addContractorParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add contractor" }
  }
}
