/**
 * lib/contacts/contactBankAccounts.ts — server CRUD for contact_bank_accounts (global multi-account banking)
 *
 * Auth:   callers (the contact-details route handlers) verify entity ownership + pass a verified org_id/contact_id
 * Data:   contact_bank_accounts — one row per account; one primary per contact (partial-unique uq_..._primary)
 * Notes:  account_number is plaintext at rest, masked on display. Setting a primary clears the others first so
 *         the partial-unique never trips; the first account a contact gets is forced primary.
 */
import type { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

type Service = Awaited<ReturnType<typeof createServiceClient>>

export interface BankAccountInput {
  account_name?: string | null
  bank_name?: string | null
  account_number?: string | null
  branch_code?: string | null
  account_type?: string | null
  label?: string | null
  is_primary?: boolean
}

const ACCOUNT_TYPES = ["cheque", "savings", "transmission"]
const clean = (s: string | null | undefined) => s?.trim() || null
const normType = (t: string | null | undefined) => (t && ACCOUNT_TYPES.includes(t) ? t : null)

function fields(input: BankAccountInput) {
  return {
    account_name: clean(input.account_name),
    bank_name: clean(input.bank_name),
    account_number: clean(input.account_number),
    branch_code: clean(input.branch_code),
    account_type: normType(input.account_type),
    label: clean(input.label),
  }
}

export async function addBankAccount(service: Service, orgId: string, contactId: string, userId: string, input: BankAccountInput) {
  const { data: existing, error: existingError } = await service
    .from("contact_bank_accounts").select("id").eq("contact_id", contactId).eq("org_id", orgId)
    logQueryError("addBankAccount contact_bank_accounts", existingError)
  const wantPrimary = input.is_primary || (existing ?? []).length === 0
  if (wantPrimary) {
    await service.from("contact_bank_accounts").update({ is_primary: false }).eq("contact_id", contactId).eq("org_id", orgId)
  }
  return service.from("contact_bank_accounts").insert({
    org_id: orgId, contact_id: contactId, created_by: userId, is_primary: wantPrimary, ...fields(input),
  })
}

export async function editBankAccount(service: Service, orgId: string, contactId: string, id: string, input: BankAccountInput) {
  if (input.is_primary) {
    await service.from("contact_bank_accounts").update({ is_primary: false })
      .eq("contact_id", contactId).eq("org_id", orgId).neq("id", id)
  }
  return service.from("contact_bank_accounts").update({
    ...fields(input),
    ...(input.is_primary === undefined ? {} : { is_primary: input.is_primary }),
  }).eq("id", id).eq("contact_id", contactId).eq("org_id", orgId)
}

export async function removeBankAccount(service: Service, orgId: string, contactId: string, id: string) {
  return service.from("contact_bank_accounts").delete().eq("id", id).eq("contact_id", contactId).eq("org_id", orgId)
}
