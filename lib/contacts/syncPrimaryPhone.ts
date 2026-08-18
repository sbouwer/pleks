/**
 * lib/contacts/syncPrimaryPhone.ts — dual-write helper for the primary_phone → contact_phones expand
 *
 * Data:   contact_phones (org-scoped)
 * Notes:  ADDENDUM_CONTACT_REPRESENTATION_UNIFICATION §7 step 2 (expand phase), mirroring
 *         lib/contacts/syncPrimaryEmail.ts for the phone column. Every writer of `contacts.primary_phone`
 *         calls this ALONGSIDE its existing column write — never instead of it; the column write stays the
 *         source of truth until step 3 (derive trigger) lands. No-ops on a blank phone (primary_phone is
 *         nullable; an empty row would misrepresent "no phone" as "one phone"). Idempotent under re-runs
 *         (imports, upserts): clears any existing primary row for the contact before inserting, so a re-run
 *         never accumulates duplicate primaries — `idx_contact_phones_primary` (002_contacts.sql) is a unique
 *         index on `(contact_id) WHERE is_primary`, so a bare insert-without-clear throws a unique violation
 *         on any second write for the same contact.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/** `error` is null on success, and on the deliberate no-op for a blank value. */
export interface SyncResult { error: string | null }

export type ContactPhoneType = "mobile" | "work" | "home" | "fax" | "other"

/** Mirror a `contacts.primary_phone` write into `contact_phones` (is_primary + is_active = true). */
export async function syncPrimaryContactPhone(
  db: SupabaseClient,
  orgId: string,
  contactId: string,
  phone: string | null | undefined,
  phoneType: ContactPhoneType = "mobile",
): Promise<SyncResult> {
  const trimmed = phone?.trim()
  if (!trimmed) return { error: null }

  // ⚠ CARRY THE ROW'S METADATA ACROSS THE DELETE. This helper replaces the primary row rather than
  // updating it (that is what makes it idempotent against idx_contact_phones_primary), but until
  // 2026-08-18 the replacement row was built from scratch — so `label` and `can_whatsapp`, which the
  // agent sets via contactSubRecords.ts and the dashboard renders, were DESTROYED on every write.
  // Not hypothetical and not tenant-specific: an agent typing a number into the tenant form wiped the
  // "After hours" label a colleague had set, silently, on ~50 call sites. The VALUE belongs to the
  // caller; the METADATA belongs to the row.
  const { data: existing, error: readError } = await db
    .from("contact_phones")
    .select("label, can_whatsapp")
    .eq("contact_id", contactId).eq("org_id", orgId).eq("is_primary", true)
    .maybeSingle()
  // ⚠ BAIL RATHER THAN PROCEED. An unchecked failure here would leave `existing` undefined, so the
  // carry-forward below would write nulls — silently destroying the very metadata this lookup exists to
  // preserve. That is the original defect reached through a different door, which is precisely how the
  // first version of this fix was incomplete. A read failure must not license a destructive write.
  if (readError) {
    console.error("[syncPrimaryContactPhone] read existing primary failed:", readError.message)
    return { error: readError.message }
  }

  const { error: clearError } = await db
    .from("contact_phones")
    .delete()
    .eq("contact_id", contactId)
    .eq("org_id", orgId)
    .eq("is_primary", true)
  if (clearError) {
    console.error("[syncPrimaryContactPhone] clear existing primary failed:", clearError.message)
    return { error: clearError.message }
  }

  const { error } = await db.from("contact_phones").insert({
    org_id: orgId,
    contact_id: contactId,
    number: trimmed,
    phone_type: phoneType,
    is_primary: true,
    is_active: true,
    // Preserved, not defaulted. `phone_type` stays caller-authoritative: call sites derive it from
    // whether the contact is a company, so it is a deliberate input rather than row metadata.
    label: existing?.label ?? null,
    can_whatsapp: existing?.can_whatsapp ?? false,
  })
  if (error) console.error("[syncPrimaryContactPhone] insert failed:", error.message)
  // Returned so a caller that NEEDS to know can check — the tenant portal must surface a failed save
  // rather than report success. Existing callers ignore it, so this is additive.
  return { error: error?.message ?? null }
}
