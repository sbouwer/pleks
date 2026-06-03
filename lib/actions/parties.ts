"use server"

/**
 * lib/actions/parties.ts — create actions for the unified add-party modal
 *
 * Auth:   requireAgentWriteAccess (agent write gate + subscription lockdown)
 * Data:   contacts (+ contact_addresses for company FICA) + the role extension table
 * Notes:  One DRY contact-row builder serves all three roles. FICA roles (landlord/tenant) capture
 *         id_number + id_number_hash (hashIdNumber; at-rest encryption is the DB's job — same pattern
 *         as lib/actions/tenants.ts) and put the company's mandated signatory in the contact_* columns;
 *         contractors are non-FICA (no ID). Tenant consent writes a real consent_log row (POPIA).
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { headers } from "next/headers"
import { hashIdNumber } from "@/lib/crypto/idNumber"
import { PARTY_ROLES, toContactEntityType, type PartyRole, type PartyEntity } from "@/lib/parties/partyConfig"
import type { PartyFormState, AddPartyInput, AddPartyResult, PartyPerson, PartyAddressInput } from "@/lib/parties/partyValidation"

type Db = Awaited<ReturnType<typeof requireAgentWriteAccess>>["db"]

function partyDisplayName(role: PartyRole, entity: PartyEntity, f: PartyFormState): string {
  if (entity === "company") return f.companyName?.trim() || PARTY_ROLES[role].singular
  return [f.firstName, f.lastName].filter(Boolean).join(" ").trim() || PARTY_ROLES[role].singular
}

/**
 * Build the contacts row (Record so the typed insert accepts the varying key set, per tenants.ts).
 * - individual: the person (+ ID for FICA roles)
 * - company, FICA (landlord/tenant): registered entity + mandated signatory in contact_* columns
 * - company, non-FICA (contractor): registered entity + primary contact person in first/last
 */
function buildPartyContactData(
  role: PartyRole, entity: PartyEntity, f: PartyFormState, orgId: string, userId: string,
): Record<string, unknown> {
  const cfg = PARTY_ROLES[role]
  const d: Record<string, unknown> = {
    org_id: orgId,
    entity_type: toContactEntityType(entity),
    primary_role: cfg.primaryRole,
    notes: f.notes?.trim() || null,
    created_by: userId,
  }

  if (entity === "individual") {
    d.title = f.title?.trim() || null
    d.initials = f.initials?.trim() || null
    d.first_name = f.firstName?.trim() || null
    d.middle_names = f.middleNames?.trim() || null
    d.last_name = f.lastName?.trim() || null
    d.suffix = f.suffix?.trim() || null
    d.designation = f.designation?.trim() || null
    d.gender = f.gender || null
    d.preferred_channel = f.preferredChannel || null
    d.primary_email = f.email?.trim() || null
    d.primary_phone = f.phone?.trim() || null
    if (cfg.fullFica) {
      d.id_type = f.idType || null
      const id = f.idNumber?.trim() || null
      d.id_number = id
      d.id_number_hash = id ? hashIdNumber(id) : null
    }
    return d
  }

  // company — people are separate `contacts` rows (insertCompanyPeople). The company row holds only the
  // company-general channel, falling back to the primary person so it's never blank. (All company contacts
  // use the people model now; the legacy single-signatory path was retired in ADDENDUM_25A_AMENDMENT.)
  d.company_name = f.companyName?.trim() || null
  d.registration_number = f.companyReg?.trim() || null
  if (cfg.fullFica) d.vat_number = f.vatNumber?.trim() || null
  const primary = (f.people ?? []).find((p) => p.isPrimary) ?? (f.people ?? [])[0]
  d.primary_email = f.companyEmail?.trim() || primary?.email?.trim() || null
  d.primary_phone = f.companyPhone?.trim() || primary?.phone?.trim() || null
  return d
}

/**
 * Insert the company's people as `contacts` rows under the org contact (ADDENDUM_25A). Each is an
 * individual with primary_role='company_contact' (kept out of role pickers) + a company_function +
 * organisation_contact_id link. Enforces exactly one primary. No-op when there are no named people.
 */
async function insertCompanyPeople(db: Db, orgId: string, userId: string, companyContactId: string, people: PartyPerson[] | undefined) {
  const named = (people ?? []).filter((p) => p.firstName?.trim() || p.lastName?.trim())
  if (named.length === 0) return
  let primaryIdx = named.findIndex((p) => p.isPrimary)
  if (primaryIdx < 0) primaryIdx = 0
  const rows = named.map((p, i) => {
    const sigId = p.isSignatory ? (p.idNumber?.trim() || null) : null
    return {
      org_id: orgId,
      entity_type: "individual",
      primary_role: "company_contact",
      organisation_contact_id: companyContactId,
      company_function: p.companyFunction || "other",
      designation: p.designation?.trim() || null,
      is_primary_contact: i === primaryIdx,
      // Signatory + FICA ID (FICA company contacts only) — the person who signs for the company.
      is_signatory: !!p.isSignatory,
      id_type: p.isSignatory ? (p.idType || "sa_id") : null,
      id_number: sigId,
      id_number_hash: sigId ? hashIdNumber(sigId) : null,
      title: p.title?.trim() || null,
      first_name: p.firstName?.trim() || null,
      last_name: p.lastName?.trim() || null,
      primary_email: p.email?.trim() || null,
      primary_phone: p.phone?.trim() || null,
      created_by: userId,
    }
  })
  const { error } = await db.from("contacts").insert(rows)
  if (error) console.error("[insertCompanyPeople] failed:", error.message)
}

/**
 * Company addresses → contact_addresses, one row per typed entry (ADDENDUM_25A_AMENDMENT). physical is the
 * primary (exactly one); postal/billing are non-primary. Skips blank entries. No migration — the
 * address_type CHECK already permits physical/postal/billing and there's no one-row-per-contact constraint.
 */
async function insertCompanyAddresses(db: Db, orgId: string, contactId: string, addresses: PartyAddressInput[] | undefined) {
  const rows = (addresses ?? [])
    .filter((a) => a.line1?.trim())
    .map((a) => ({
      org_id: orgId,
      contact_id: contactId,
      address_type: a.type,
      street_line1: a.line1!.trim(),
      street_line2: a.line2?.trim() || null,
      suburb: a.suburb?.trim() || null,
      city: a.city?.trim() || null,
      province: a.province || null,
      postal_code: a.postal?.trim() || null,
      is_primary: a.type === "physical",
    }))
  if (rows.length === 0) return
  const { error } = await db.from("contact_addresses").insert(rows)
  if (error) console.error("[insertCompanyAddresses] failed:", error.message)
}

async function auditPartyCreate(db: Db, orgId: string, userId: string, table: string, recordId: string, role: PartyRole, entity: PartyEntity, name: string) {
  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: table,
    record_id: recordId,
    action: "INSERT",
    changed_by: userId,
    new_values: { action: `${role}_added`, entity, name },
  })
}

// ── Contractor ────────────────────────────────────────────────────────────────
export async function addContractorParty(input: AddPartyInput, supplierType: string = "contractor"): Promise<AddPartyResult> {
  if (input.role !== "supplier") return { ok: false, error: "Unsupported role for this action" }
  try {
    const { db, userId, orgId } = await requireAgentWriteAccess("add_contractor")
    const f = input.form
    const name = partyDisplayName("supplier", input.entity, f)

    const { data: contact, error: contactErr } = await db
      .from("contacts").insert(buildPartyContactData("supplier", input.entity, f, orgId, userId)).select("id").single()
    if (contactErr || !contact) {
      console.error("[addContractorParty] contact insert failed:", contactErr?.message)
      return { ok: false, error: "Failed to create the contact" }
    }

    const { error: conErr } = await db.from("contractors").insert({
      org_id: orgId, contact_id: contact.id, is_active: f.isActive !== false,
      specialities: f.specialities ?? [], supplier_type: supplierType,
    })
    if (conErr) {
      console.error("[addContractorParty] contractor insert failed:", conErr.message)
      await db.from("contacts").delete().eq("id", contact.id).eq("org_id", orgId)
      return { ok: false, error: "Failed to create the contractor" }
    }

    if (input.entity === "company") await insertCompanyPeople(db, orgId, userId, contact.id, f.people)

    await auditPartyCreate(db, orgId, userId, "contractors", contact.id, "supplier", input.entity, name)
    return { ok: true, name, id: contact.id as string }
  } catch (err) {
    console.error("[addContractorParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add contractor" }
  }
}

// ── Landlord ──────────────────────────────────────────────────────────────────
export async function addLandlordParty(input: AddPartyInput): Promise<AddPartyResult> {
  if (input.role !== "landlord") return { ok: false, error: "Unsupported role for this action" }
  try {
    const { db, userId, orgId } = await requireAgentWriteAccess("create_landlord")
    const f = input.form
    const name = partyDisplayName("landlord", input.entity, f)

    const { data: contact, error: contactErr } = await db
      .from("contacts").insert(buildPartyContactData("landlord", input.entity, f, orgId, userId)).select("id").single()
    if (contactErr || !contact) {
      console.error("[addLandlordParty] contact insert failed:", contactErr?.message)
      return { ok: false, error: "Failed to create the contact" }
    }
    if (input.entity === "company") {
      await insertCompanyAddresses(db, orgId, contact.id, f.addresses)
      await insertCompanyPeople(db, orgId, userId, contact.id, f.people)
    }

    const { data: landlord, error: llErr } = await db.from("landlords").insert({
      org_id: orgId,
      contact_id: contact.id,
      bank_name: f.bankName?.trim() || null,
      bank_account: f.accountNumber?.trim() || null,
      bank_branch: f.branchCode?.trim() || null,
      created_by: userId,
    }).select("id").single()
    if (llErr || !landlord) {
      console.error("[addLandlordParty] landlord insert failed:", llErr?.message)
      await db.from("contacts").delete().eq("id", contact.id).eq("org_id", orgId)
      return { ok: false, error: "Failed to create the landlord" }
    }

    await auditPartyCreate(db, orgId, userId, "landlords", landlord.id, "landlord", input.entity, name)
    return { ok: true, name, id: landlord.id as string }
  } catch (err) {
    console.error("[addLandlordParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add landlord" }
  }
}

// ── Tenant ────────────────────────────────────────────────────────────────────
export async function addTenantParty(input: AddPartyInput): Promise<AddPartyResult> {
  if (input.role !== "tenant") return { ok: false, error: "Unsupported role for this action" }
  try {
    const { db, userId, orgId } = await requireAgentWriteAccess("create_tenant")
    const f = input.form
    const name = partyDisplayName("tenant", input.entity, f)
    const consent = f.popiaConsent === true
    // Tenant company now uses the people repeater (25A) — consent subject = company-general or primary person.
    const primaryPerson = (f.people ?? []).find((p) => p.isPrimary) ?? (f.people ?? [])[0]
    const subjectEmail = (input.entity === "company" ? (f.companyEmail || primaryPerson?.email) : f.email)?.trim() || null

    const { data: contact, error: contactErr } = await db
      .from("contacts").insert(buildPartyContactData("tenant", input.entity, f, orgId, userId)).select("id").single()
    if (contactErr || !contact) {
      console.error("[addTenantParty] contact insert failed:", contactErr?.message)
      return { ok: false, error: "Failed to create the contact" }
    }
    if (input.entity === "company") {
      await insertCompanyAddresses(db, orgId, contact.id, f.addresses)
      await insertCompanyPeople(db, orgId, userId, contact.id, f.people)
    }

    const now = new Date().toISOString()
    const { data: tenant, error: tErr } = await db.from("tenants").insert({
      org_id: orgId,
      contact_id: contact.id,
      popia_consent_given: consent,
      popia_consent_given_at: consent ? now : null,
      employer_name: f.employer?.trim() || null,
      occupation: f.occupation?.trim() || null,
      created_by: userId,
    }).select("id").single()
    if (tErr || !tenant) {
      console.error("[addTenantParty] tenant insert failed:", tErr?.message)
      await db.from("contacts").delete().eq("id", contact.id).eq("org_id", orgId)
      return { ok: false, error: "Failed to create the tenant" }
    }

    // POPIA consent — record a consent_log row with IP/UA for s18 accountability.
    if (consent && subjectEmail) {
      const h = await headers()
      await db.from("consent_log").insert({
        org_id: orgId,
        user_id: userId,
        subject_email: subjectEmail,
        consent_type: "data_processing",
        consent_given: true,
        consent_version: "1.0-tenant-onboard",
        ip_address: h.get("x-forwarded-for") || "unknown",
        user_agent: h.get("user-agent") || "",
        metadata: { tenant_id: tenant.id, agent_confirmed: true, tenant_type: input.entity },
      })
    }

    await auditPartyCreate(db, orgId, userId, "tenants", tenant.id, "tenant", input.entity, name)
    return { ok: true, name, id: tenant.id as string }
  } catch (err) {
    console.error("[addTenantParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add tenant" }
  }
}
