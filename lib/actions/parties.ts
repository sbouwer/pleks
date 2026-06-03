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
import { gateway } from "@/lib/supabase/gateway"
import { headers } from "next/headers"
import { hashIdNumber } from "@/lib/crypto/idNumber"
import { PARTY_ROLES, toContactEntityType, type PartyRole, type PartyEntity } from "@/lib/parties/partyConfig"
import type { PartyFormState, AddPartyInput, AddPartyResult, PartyPerson, PartyAddressInput, PartyBankAccountInput } from "@/lib/parties/partyValidation"

type Db = Awaited<ReturnType<typeof requireAgentWriteAccess>>["db"]

/** Parse a ZAR string (possibly "R 450,00" / "450") to integer cents; null when blank/unparseable. */
function zarToCents(v: string | undefined): number | null {
  if (!v?.trim()) return null
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** Bank accounts captured at create → contact_bank_accounts (first = primary). Skips blank rows. */
async function insertPartyBankAccounts(db: Db, orgId: string, contactId: string, accounts: PartyBankAccountInput[] | undefined) {
  const rows = (accounts ?? [])
    .filter((a) => a.bankName?.trim() || a.accountNumber?.trim())
    .map((a, i) => ({
      org_id: orgId,
      contact_id: contactId,
      account_name: a.accountName?.trim() || null,
      bank_name: a.bankName?.trim() || null,
      account_number: a.accountNumber?.trim() || null,
      branch_code: a.branchCode?.trim() || null,
      account_type: a.accountType || null,
      label: a.label?.trim() || null,
      is_primary: i === 0,
    }))
  if (rows.length === 0) return
  const { error } = await db.from("contact_bank_accounts").insert(rows)
  if (error) console.error("[insertPartyBankAccounts] failed:", error.message)
}

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

async function auditPartyUpdate(db: Db, orgId: string, userId: string, table: string, recordId: string, role: PartyRole, entity: PartyEntity, name: string) {
  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: table,
    record_id: recordId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { action: `${role}_updated`, entity, name },
  })
}

// ── Edit helpers (shared by the update* actions) ──────────────────────────────

/** Editable contact scalar fields (entity-aware). entity_type / primary_role are immutable on edit.
 *  For FICA individuals (landlord/tenant) the ID round-trips (pre-filled by fetch → editable here). */
function buildContactScalarUpdate(entity: PartyEntity, f: PartyFormState, fica: boolean, primary?: PartyPerson): Record<string, unknown> {
  if (entity === "individual") {
    const base: Record<string, unknown> = {
      title: f.title?.trim() || null, initials: f.initials?.trim() || null,
      first_name: f.firstName?.trim() || null, middle_names: f.middleNames?.trim() || null,
      last_name: f.lastName?.trim() || null, suffix: f.suffix?.trim() || null,
      designation: f.designation?.trim() || null, gender: f.gender || null,
      preferred_channel: f.preferredChannel || null,
      primary_email: f.email?.trim() || null, primary_phone: f.phone?.trim() || null,
      vat_number: f.vatNumber?.trim() || null,
    }
    if (fica) {
      const id = f.idNumber?.trim() || null
      base.id_type = f.idType || "sa_id"
      base.id_number = id
      base.id_number_hash = id ? hashIdNumber(id) : null
    }
    return base
  }
  return {
    company_name: f.companyName?.trim() || null,
    registration_number: f.companyReg?.trim() || null,
    vat_number: f.vatNumber?.trim() || null,
    primary_email: f.companyEmail?.trim() || primary?.email?.trim() || null,
    primary_phone: f.companyPhone?.trim() || primary?.phone?.trim() || null,
  }
}

/** Upsert company people: update by id, insert new, soft-delete removed. Clears primary first to dodge uq. */
async function upsertCompanyPeople(db: Db, orgId: string, userId: string, companyContactId: string, people: PartyPerson[] | undefined) {
  const list = (people ?? []).filter((p) => p.firstName?.trim() || p.lastName?.trim())
  const { data: existing } = await db.from("contacts")
    .select("id").eq("organisation_contact_id", companyContactId).eq("org_id", orgId).is("deleted_at", null)
  const existingIds = new Set((existing ?? []).map((r) => r.id as string))
  const submittedIds = new Set(list.filter((p) => p.id).map((p) => p.id as string))

  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id))
  if (toDelete.length > 0) {
    await db.from("contacts").update({ deleted_at: new Date().toISOString() }).in("id", toDelete).eq("org_id", orgId)
  }
  // clear all primaries up front so the partial-unique never trips mid-loop
  await db.from("contacts").update({ is_primary_contact: false }).eq("organisation_contact_id", companyContactId).eq("org_id", orgId)

  let primaryIdx = list.findIndex((p) => p.isPrimary)
  if (primaryIdx < 0) primaryIdx = 0
  for (let i = 0; i < list.length; i++) {
    const p = list[i]
    const sigId = p.isSignatory ? (p.idNumber?.trim() || null) : null
    const row = {
      company_function: p.companyFunction || "other",
      designation: p.designation?.trim() || null,
      is_primary_contact: i === primaryIdx,
      is_signatory: !!p.isSignatory,
      id_type: p.isSignatory ? (p.idType || "sa_id") : null,
      id_number: sigId,
      id_number_hash: sigId ? hashIdNumber(sigId) : null,
      title: p.title?.trim() || null,
      first_name: p.firstName?.trim() || null,
      last_name: p.lastName?.trim() || null,
      primary_email: p.email?.trim() || null,
      primary_phone: p.phone?.trim() || null,
    }
    if (p.id && existingIds.has(p.id)) {
      await db.from("contacts").update(row).eq("id", p.id).eq("org_id", orgId)
    } else {
      await db.from("contacts").insert({
        org_id: orgId, entity_type: "individual", primary_role: "company_contact",
        organisation_contact_id: companyContactId, created_by: userId, ...row,
      })
    }
  }
}

/** Replace the typed (physical/postal/billing) addresses; leaves work/other addresses untouched. */
async function replaceTypedAddresses(db: Db, orgId: string, contactId: string, addresses: PartyAddressInput[] | undefined) {
  await db.from("contact_addresses").delete()
    .eq("contact_id", contactId).eq("org_id", orgId).in("address_type", ["physical", "postal", "billing"])
  await insertCompanyAddresses(db, orgId, contactId, addresses)
}

/** Replace all bank accounts (no FK deps on contact_bank_accounts). */
async function replaceBankAccounts(db: Db, orgId: string, contactId: string, accounts: PartyBankAccountInput[] | undefined) {
  await db.from("contact_bank_accounts").delete().eq("contact_id", contactId).eq("org_id", orgId)
  await insertPartyBankAccounts(db, orgId, contactId, accounts)
}

/** Existing company people → PartyPerson[] (carries the DB id for the edit diff). */
async function fetchCompanyPeopleAsParty(db: Db, orgId: string, companyContactId: string): Promise<PartyPerson[]> {
  const { data } = await db.from("contacts")
    .select("id, title, first_name, last_name, company_function, designation, is_primary_contact, is_signatory, id_type, id_number, primary_email, primary_phone")
    .eq("organisation_contact_id", companyContactId).eq("org_id", orgId).is("deleted_at", null)
    .order("is_primary_contact", { ascending: false })
  return (data ?? []).map((p) => ({
    _uid: p.id as string, id: p.id as string,
    title: (p.title as string | null) ?? undefined,
    firstName: (p.first_name as string | null) ?? undefined,
    lastName: (p.last_name as string | null) ?? undefined,
    companyFunction: (p.company_function as string | null) ?? undefined,
    designation: (p.designation as string | null) ?? undefined,
    email: (p.primary_email as string | null) ?? undefined,
    phone: (p.primary_phone as string | null) ?? undefined,
    isPrimary: !!p.is_primary_contact,
    isSignatory: !!p.is_signatory,
    idType: (p.id_type as string | null) ?? undefined,
    idNumber: (p.id_number as string | null) ?? undefined,
  }))
}

const centsToZar = (c: number | null | undefined): string | undefined => (c == null ? undefined : String(c / 100))

function mapAddressesToForm(rows: Array<Record<string, unknown>> | null): PartyAddressInput[] {
  return (rows ?? [])
    .filter((a) => ["physical", "postal", "billing"].includes(a.address_type as string))
    .map((a) => ({
      type: a.address_type as PartyAddressInput["type"],
      line1: (a.street_line1 as string | null) ?? undefined,
      line2: (a.street_line2 as string | null) ?? undefined,
      suburb: (a.suburb as string | null) ?? undefined,
      city: (a.city as string | null) ?? undefined,
      province: (a.province as string | null) ?? undefined,
      postal: (a.postal_code as string | null) ?? undefined,
    }))
}

/** Full individual identity fields from contacts → form (so editing doesn't wipe title/gender/etc.). */
async function individualIdentityForm(db: Db, contactId: string): Promise<Partial<PartyFormState>> {
  const { data: c } = await db.from("contacts")
    .select("title, initials, middle_names, suffix, designation, gender, preferred_channel, id_type, id_number, vat_number")
    .eq("id", contactId).single()
  if (!c) return {}
  return {
    title: (c.title as string | null) ?? undefined,
    initials: (c.initials as string | null) ?? undefined,
    middleNames: (c.middle_names as string | null) ?? undefined,
    suffix: (c.suffix as string | null) ?? undefined,
    designation: (c.designation as string | null) ?? undefined,
    gender: (c.gender as string | null) ?? undefined,
    preferredChannel: (c.preferred_channel as string | null) ?? undefined,
    idType: (c.id_type as string | null) ?? undefined,
    idNumber: (c.id_number as string | null) ?? undefined,
    vatNumber: (c.vat_number as string | null) ?? undefined,
  }
}

function mapBankAccountsToForm(rows: Array<Record<string, unknown>> | null): PartyBankAccountInput[] {
  return (rows ?? []).map((b) => ({
    _uid: b.id as string, id: b.id as string,
    accountName: (b.account_name as string | null) ?? undefined,
    bankName: (b.bank_name as string | null) ?? undefined,
    accountNumber: (b.account_number as string | null) ?? undefined,
    branchCode: (b.branch_code as string | null) ?? undefined,
    accountType: (b.account_type as string | null) ?? undefined,
    label: (b.label as string | null) ?? undefined,
  }))
}

/** Result of a fetch-as-party (pre-fill payload for the edit modal). */
export interface PartyEditData {
  ok: boolean
  error?: string
  entity?: PartyEntity
  form?: PartyFormState
  name?: string
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
      call_out_rate_cents: zarToCents(f.callOutRate),
      hourly_rate_cents: zarToCents(f.hourlyRate),
      vat_registered: !!f.vatRegistered,
    })
    if (conErr) {
      console.error("[addContractorParty] contractor insert failed:", conErr.message)
      await db.from("contacts").delete().eq("id", contact.id).eq("org_id", orgId)
      return { ok: false, error: "Failed to create the contractor" }
    }

    // VAT number lives on the contact (buildPartyContactData only sets it for FICA companies).
    if (f.vatNumber?.trim()) {
      await db.from("contacts").update({ vat_number: f.vatNumber.trim() }).eq("id", contact.id).eq("org_id", orgId)
    }

    if (input.entity === "company") await insertCompanyPeople(db, orgId, userId, contact.id, f.people)
    await insertCompanyAddresses(db, orgId, contact.id, f.addresses)
    await insertPartyBankAccounts(db, orgId, contact.id, f.bankAccounts)

    await auditPartyCreate(db, orgId, userId, "contractors", contact.id, "supplier", input.entity, name)
    return { ok: true, name, id: contact.id as string }
  } catch (err) {
    console.error("[addContractorParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add contractor" }
  }
}

/** Fetch a contractor as a pre-filled PartyFormState for the edit modal. */
export async function fetchContractorParty(contractorId: string): Promise<PartyEditData> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authorised" }
  const { db, orgId } = gw

  const { data: c } = await db.from("contractor_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, registration_number, vat_number, email, phone, specialities, is_active, notes, call_out_rate_cents, hourly_rate_cents")
    .eq("id", contractorId).eq("org_id", orgId).single()
  if (!c) return { ok: false, error: "Supplier not found" }

  const [{ data: con }, { data: addrs }, { data: banks }] = await Promise.all([
    db.from("contractors").select("vat_registered").eq("id", contractorId).eq("org_id", orgId).single(),
    db.from("contact_addresses").select("street_line1, street_line2, suburb, city, province, postal_code, address_type").eq("contact_id", c.contact_id),
    db.from("contact_bank_accounts").select("id, account_name, bank_name, account_number, branch_code, account_type, label, is_primary").eq("contact_id", c.contact_id).order("is_primary", { ascending: false }),
  ])

  const entity: PartyEntity = c.entity_type === "organisation" ? "company" : "individual"
  const people = entity === "company" ? await fetchCompanyPeopleAsParty(db, orgId, c.contact_id) : undefined

  const form: PartyFormState = {
    firstName: (c.first_name as string | null) ?? undefined,
    lastName: (c.last_name as string | null) ?? undefined,
    companyName: (c.company_name as string | null) ?? undefined,
    companyReg: (c.registration_number as string | null) ?? undefined,
    vatNumber: (c.vat_number as string | null) ?? undefined,
    email: entity === "individual" ? ((c.email as string | null) ?? undefined) : undefined,
    phone: entity === "individual" ? ((c.phone as string | null) ?? undefined) : undefined,
    companyEmail: entity === "company" ? ((c.email as string | null) ?? undefined) : undefined,
    companyPhone: entity === "company" ? ((c.phone as string | null) ?? undefined) : undefined,
    people,
    specialities: (c.specialities as string[] | null) ?? [],
    isActive: c.is_active !== false,
    notes: (c.notes as string | null) ?? undefined,
    callOutRate: centsToZar(c.call_out_rate_cents as number | null),
    hourlyRate: centsToZar(c.hourly_rate_cents as number | null),
    vatRegistered: !!con?.vat_registered,
    addresses: mapAddressesToForm(addrs),
    bankAccounts: mapBankAccountsToForm(banks),
  }
  if (entity === "individual") Object.assign(form, await individualIdentityForm(db, c.contact_id as string))
  return { ok: true, entity, form, name: partyDisplayName("supplier", entity, form) }
}

/** Update a contractor from the edit modal (scalars + collection upsert). */
export async function updateContractorParty(input: AddPartyInput, contractorId: string): Promise<AddPartyResult> {
  if (input.role !== "supplier") return { ok: false, error: "Unsupported role for this action" }
  try {
    const { db, userId, orgId } = await requireAgentWriteAccess("update_contractor")
    const f = input.form

    const { data: con } = await db.from("contractors").select("contact_id").eq("id", contractorId).eq("org_id", orgId).single()
    if (!con) return { ok: false, error: "Supplier not found" }
    const contactId = con.contact_id as string

    const primary = (f.people ?? []).find((p) => p.isPrimary) ?? (f.people ?? [])[0]
    const { error: cErr } = await db.from("contacts")
      .update(buildContactScalarUpdate(input.entity, f, false, primary)).eq("id", contactId).eq("org_id", orgId)
    if (cErr) { console.error("[updateContractorParty] contact update failed:", cErr.message); return { ok: false, error: "Failed to update the contact" } }

    const { error: conErr } = await db.from("contractors").update({
      is_active: f.isActive !== false,
      specialities: f.specialities ?? [],
      call_out_rate_cents: zarToCents(f.callOutRate),
      hourly_rate_cents: zarToCents(f.hourlyRate),
      vat_registered: !!f.vatRegistered,
    }).eq("id", contractorId).eq("org_id", orgId)
    if (conErr) { console.error("[updateContractorParty] contractor update failed:", conErr.message); return { ok: false, error: "Failed to update the supplier" } }

    if (input.entity === "company") await upsertCompanyPeople(db, orgId, userId, contactId, f.people)
    await replaceTypedAddresses(db, orgId, contactId, f.addresses)
    await replaceBankAccounts(db, orgId, contactId, f.bankAccounts)

    const name = partyDisplayName("supplier", input.entity, f)
    await auditPartyUpdate(db, orgId, userId, "contractors", contractorId, "supplier", input.entity, name)
    return { ok: true, name, id: contractorId }
  } catch (err) {
    console.error("[updateContractorParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update supplier" }
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
      created_by: userId,
    }).select("id").single()
    if (llErr || !landlord) {
      console.error("[addLandlordParty] landlord insert failed:", llErr?.message)
      await db.from("contacts").delete().eq("id", contact.id).eq("org_id", orgId)
      return { ok: false, error: "Failed to create the landlord" }
    }

    // Banking → contact_bank_accounts (global multi-account; supersedes the dropped landlords.bank_*).
    await insertPartyBankAccounts(db, orgId, contact.id, f.bankAccounts)

    await auditPartyCreate(db, orgId, userId, "landlords", landlord.id, "landlord", input.entity, name)
    return { ok: true, name, id: landlord.id as string }
  } catch (err) {
    console.error("[addLandlordParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add landlord" }
  }
}

/** Fetch a landlord as a pre-filled PartyFormState for the edit modal. */
export async function fetchLandlordParty(landlordId: string): Promise<PartyEditData> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authorised" }
  const { db, orgId } = gw

  const { data: l } = await db.from("landlord_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, registration_number, vat_number, email, phone, notes")
    .eq("id", landlordId).eq("org_id", orgId).single()
  if (!l) return { ok: false, error: "Landlord not found" }
  const entity: PartyEntity = l.entity_type === "organisation" ? "company" : "individual"

  const [{ data: addrs }, { data: banks }] = await Promise.all([
    db.from("contact_addresses").select("street_line1, street_line2, suburb, city, province, postal_code, address_type").eq("contact_id", l.contact_id),
    db.from("contact_bank_accounts").select("id, account_name, bank_name, account_number, branch_code, account_type, label, is_primary").eq("contact_id", l.contact_id).order("is_primary", { ascending: false }),
  ])
  const people = entity === "company" ? await fetchCompanyPeopleAsParty(db, orgId, l.contact_id) : undefined

  const form: PartyFormState = {
    firstName: (l.first_name as string | null) ?? undefined,
    lastName: (l.last_name as string | null) ?? undefined,
    companyName: (l.company_name as string | null) ?? undefined,
    companyReg: (l.registration_number as string | null) ?? undefined,
    vatNumber: (l.vat_number as string | null) ?? undefined,
    email: entity === "individual" ? ((l.email as string | null) ?? undefined) : undefined,
    phone: entity === "individual" ? ((l.phone as string | null) ?? undefined) : undefined,
    companyEmail: entity === "company" ? ((l.email as string | null) ?? undefined) : undefined,
    companyPhone: entity === "company" ? ((l.phone as string | null) ?? undefined) : undefined,
    people,
    notes: (l.notes as string | null) ?? undefined,
    addresses: mapAddressesToForm(addrs),
    bankAccounts: mapBankAccountsToForm(banks),
  }
  if (entity === "individual") Object.assign(form, await individualIdentityForm(db, l.contact_id as string))
  return { ok: true, entity, form, name: partyDisplayName("landlord", entity, form) }
}

/** Update a landlord from the edit modal (scalars + collection upsert). */
export async function updateLandlordParty(input: AddPartyInput, landlordId: string): Promise<AddPartyResult> {
  if (input.role !== "landlord") return { ok: false, error: "Unsupported role for this action" }
  try {
    const { db, userId, orgId } = await requireAgentWriteAccess("update_landlord")
    const f = input.form

    const { data: ll } = await db.from("landlords").select("contact_id").eq("id", landlordId).eq("org_id", orgId).single()
    if (!ll) return { ok: false, error: "Landlord not found" }
    const contactId = ll.contact_id as string

    const primary = (f.people ?? []).find((p) => p.isPrimary) ?? (f.people ?? [])[0]
    const { error: cErr } = await db.from("contacts")
      .update(buildContactScalarUpdate(input.entity, f, true, primary)).eq("id", contactId).eq("org_id", orgId)
    if (cErr) { console.error("[updateLandlordParty] contact update failed:", cErr.message); return { ok: false, error: "Failed to update the contact" } }

    if (input.entity === "company") await upsertCompanyPeople(db, orgId, userId, contactId, f.people)
    await replaceTypedAddresses(db, orgId, contactId, f.addresses)
    await replaceBankAccounts(db, orgId, contactId, f.bankAccounts)

    const name = partyDisplayName("landlord", input.entity, f)
    await auditPartyUpdate(db, orgId, userId, "landlords", landlordId, "landlord", input.entity, name)
    return { ok: true, name, id: landlordId }
  } catch (err) {
    console.error("[updateLandlordParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update landlord" }
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

/** Fetch a tenant as a pre-filled PartyFormState for the edit modal (POPIA consent pre-checked). */
export async function fetchTenantParty(tenantId: string): Promise<PartyEditData> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authorised" }
  const { db, orgId } = gw

  const { data: t } = await db.from("tenant_view")
    .select("contact_id, entity_type, first_name, last_name, company_name, email, phone, id_type, id_number, employer_name, occupation, notes")
    .eq("id", tenantId).eq("org_id", orgId).single()
  if (!t) return { ok: false, error: "Tenant not found" }
  const entity: PartyEntity = t.entity_type === "organisation" ? "company" : "individual"

  const [{ data: ident }, { data: addrs }] = await Promise.all([
    db.from("contacts").select("registration_number, vat_number").eq("id", t.contact_id as string).single(),
    db.from("contact_addresses").select("street_line1, street_line2, suburb, city, province, postal_code, address_type").eq("contact_id", t.contact_id),
  ])
  const people = entity === "company" ? await fetchCompanyPeopleAsParty(db, orgId, t.contact_id as string) : undefined

  const form: PartyFormState = {
    firstName: (t.first_name as string | null) ?? undefined,
    lastName: (t.last_name as string | null) ?? undefined,
    companyName: (t.company_name as string | null) ?? undefined,
    companyReg: (ident?.registration_number as string | null) ?? undefined,
    vatNumber: (ident?.vat_number as string | null) ?? undefined,
    email: entity === "individual" ? ((t.email as string | null) ?? undefined) : undefined,
    phone: entity === "individual" ? ((t.phone as string | null) ?? undefined) : undefined,
    companyEmail: entity === "company" ? ((t.email as string | null) ?? undefined) : undefined,
    companyPhone: entity === "company" ? ((t.phone as string | null) ?? undefined) : undefined,
    idType: (t.id_type as string | null) ?? undefined,
    idNumber: (t.id_number as string | null) ?? undefined,
    people,
    employer: (t.employer_name as string | null) ?? undefined,
    occupation: (t.occupation as string | null) ?? undefined,
    notes: (t.notes as string | null) ?? undefined,
    popiaConsent: true, // already a tenant → consent on file; pre-checked so the details gate passes
    addresses: mapAddressesToForm(addrs),
  }
  if (entity === "individual") Object.assign(form, await individualIdentityForm(db, t.contact_id as string))
  return { ok: true, entity, form, name: partyDisplayName("tenant", entity, form) }
}

/** Update a tenant from the edit modal (scalars + tenant fields + collection upsert). POPIA not re-logged. */
export async function updateTenantParty(input: AddPartyInput, tenantId: string): Promise<AddPartyResult> {
  if (input.role !== "tenant") return { ok: false, error: "Unsupported role for this action" }
  try {
    const { db, userId, orgId } = await requireAgentWriteAccess("update_tenant")
    const f = input.form

    const { data: tn } = await db.from("tenants").select("contact_id").eq("id", tenantId).eq("org_id", orgId).single()
    if (!tn) return { ok: false, error: "Tenant not found" }
    const contactId = tn.contact_id as string

    const primary = (f.people ?? []).find((p) => p.isPrimary) ?? (f.people ?? [])[0]
    const { error: cErr } = await db.from("contacts")
      .update(buildContactScalarUpdate(input.entity, f, true, primary)).eq("id", contactId).eq("org_id", orgId)
    if (cErr) { console.error("[updateTenantParty] contact update failed:", cErr.message); return { ok: false, error: "Failed to update the contact" } }

    const { error: tErr } = await db.from("tenants").update({
      employer_name: f.employer?.trim() || null,
      occupation: f.occupation?.trim() || null,
    }).eq("id", tenantId).eq("org_id", orgId)
    if (tErr) { console.error("[updateTenantParty] tenant update failed:", tErr.message); return { ok: false, error: "Failed to update the tenant" } }

    if (input.entity === "company") await upsertCompanyPeople(db, orgId, userId, contactId, f.people)
    await replaceTypedAddresses(db, orgId, contactId, f.addresses)

    const name = partyDisplayName("tenant", input.entity, f)
    await auditPartyUpdate(db, orgId, userId, "tenants", tenantId, "tenant", input.entity, name)
    return { ok: true, name, id: tenantId }
  } catch (err) {
    console.error("[updateTenantParty] failed:", err instanceof Error ? err.message : err)
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update tenant" }
  }
}
