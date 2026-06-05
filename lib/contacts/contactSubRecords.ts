/**
 * lib/contacts/contactSubRecords.ts — shared CRUD for a contact's sub-records (phones, emails, addresses, bank accounts)
 *
 * Auth:   callers (the per-entity contact-details routes) verify entity ownership + pass a verified org_id/contact_id
 * Data:   contact_phones, contact_emails, contact_addresses, contact_bank_accounts — switched on body.type
 * Notes:  one place for the type dispatch so the three entity routes (suppliers/landlords/tenants) stay thin and
 *         identical. Each per-type op is its own small function to keep cognitive complexity low.
 */
import type { createServiceClient } from "@/lib/supabase/server"
import { addBankAccount, editBankAccount, removeBankAccount } from "./contactBankAccounts"
import { recordAudit } from "@/lib/audit/recordAudit"

type Service = Awaited<ReturnType<typeof createServiceClient>>

/** Delete a contact child row (phone/email/address) + audit it (contact PII change). */
async function deleteContactChild(
  service: Service, orgId: string, contactId: string, userId: string, table: string, id: string, semantic: string,
) {
  const res = await service.from(table).delete().eq("id", id).eq("contact_id", contactId)
  if (!res.error) {
    await recordAudit(service, {
      orgId, actorId: userId, action: "DELETE", table, recordId: id,
      after: { action: semantic, contact_id: contactId },
    })
  }
  return res
}

export interface SubRecordBody {
  type?: string
  id?: string
  contactId?: string
  number?: string; phone_type?: string; label?: string; is_primary?: boolean; can_whatsapp?: boolean
  email?: string; email_type?: string
  street_line1?: string; street_line2?: string; suburb?: string; city?: string
  province?: string; postal_code?: string; country?: string; address_type?: string
  account_name?: string; bank_name?: string; account_number?: string; branch_code?: string; account_type?: string
}

export type SubRecordResult = { ok: true } | { ok: false; error: string; status: number }

const OK: SubRecordResult = { ok: true }
const fail = (error: string, status = 500): SubRecordResult => ({ ok: false, error, status })
const wrap = (r: { error: { message: string } | null }): SubRecordResult => (r.error ? fail(r.error.message) : OK)

// ── Create ──────────────────────────────────────────────────────────────────
async function insertPhone(service: Service, orgId: string, contactId: string, b: SubRecordBody) {
  if (!b.number?.trim()) return fail("Number is required", 400)
  return wrap(await service.from("contact_phones").insert({
    org_id: orgId, contact_id: contactId, number: b.number.trim(),
    phone_type: b.phone_type ?? "mobile", label: b.label ?? null,
    is_primary: b.is_primary ?? false, can_whatsapp: b.can_whatsapp ?? false,
  }))
}

async function insertEmail(service: Service, orgId: string, contactId: string, b: SubRecordBody) {
  if (!b.email?.trim()) return fail("Email is required", 400)
  return wrap(await service.from("contact_emails").insert({
    org_id: orgId, contact_id: contactId, email: b.email.trim(),
    email_type: b.email_type ?? "work", label: b.label ?? null, is_primary: b.is_primary ?? false,
  }))
}

async function insertAddress(service: Service, orgId: string, contactId: string, b: SubRecordBody) {
  return wrap(await service.from("contact_addresses").insert({
    org_id: orgId, contact_id: contactId,
    street_line1: b.street_line1 ?? null, street_line2: b.street_line2 ?? null,
    suburb: b.suburb ?? null, city: b.city ?? null, province: b.province ?? null,
    postal_code: b.postal_code ?? null, country: b.country?.trim() || "South Africa",
    address_type: b.address_type ?? "physical", is_primary: b.is_primary ?? false,
  }))
}

export async function createSubRecord(service: Service, orgId: string, contactId: string, userId: string, b: SubRecordBody): Promise<SubRecordResult> {
  switch (b.type) {
    case "phone": return insertPhone(service, orgId, contactId, b)
    case "email": return insertEmail(service, orgId, contactId, b)
    case "address": return insertAddress(service, orgId, contactId, b)
    case "bank_account": return wrap(await addBankAccount(service, orgId, contactId, userId, b))
    default: return fail("Invalid type", 400)
  }
}

// ── Update ──────────────────────────────────────────────────────────────────
function updatePhone(service: Service, contactId: string, id: string, b: SubRecordBody) {
  return service.from("contact_phones").update({
    number: b.number?.trim(), phone_type: b.phone_type ?? "mobile", label: b.label ?? null, can_whatsapp: b.can_whatsapp ?? false,
  }).eq("id", id).eq("contact_id", contactId)
}

function updateEmail(service: Service, contactId: string, id: string, b: SubRecordBody) {
  return service.from("contact_emails").update({
    email: b.email?.trim(), email_type: b.email_type ?? "work", label: b.label ?? null,
  }).eq("id", id).eq("contact_id", contactId)
}

function updateAddress(service: Service, contactId: string, id: string, b: SubRecordBody) {
  return service.from("contact_addresses").update({
    street_line1: b.street_line1 ?? null, street_line2: b.street_line2 ?? null,
    suburb: b.suburb ?? null, city: b.city ?? null, province: b.province ?? null,
    postal_code: b.postal_code ?? null, country: b.country?.trim() || "South Africa",
    address_type: b.address_type ?? "physical",
  }).eq("id", id).eq("contact_id", contactId)
}

export async function updateSubRecord(service: Service, orgId: string, contactId: string, userId: string, b: SubRecordBody): Promise<SubRecordResult> {
  if (!b.id) return fail("Missing id", 400)
  switch (b.type) {
    case "phone": return wrap(await updatePhone(service, contactId, b.id, b))
    case "email": return wrap(await updateEmail(service, contactId, b.id, b))
    case "address": return wrap(await updateAddress(service, contactId, b.id, b))
    case "bank_account": return wrap(await editBankAccount(service, orgId, contactId, b.id, userId, b))
    default: return fail("Invalid type", 400)
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────
export async function deleteSubRecord(service: Service, orgId: string, contactId: string, userId: string, b: SubRecordBody): Promise<SubRecordResult> {
  if (!b.id) return fail("Missing id", 400)
  switch (b.type) {
    case "phone": return wrap(await deleteContactChild(service, orgId, contactId, userId, "contact_phones", b.id, "contact_phone_removed"))
    case "email": return wrap(await deleteContactChild(service, orgId, contactId, userId, "contact_emails", b.id, "contact_email_removed"))
    case "address": return wrap(await deleteContactChild(service, orgId, contactId, userId, "contact_addresses", b.id, "contact_address_removed"))
    case "bank_account": return wrap(await removeBankAccount(service, orgId, contactId, b.id, userId))
    default: return fail("Invalid type", 400)
  }
}
