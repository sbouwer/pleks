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

export type ContactPhoneType = "mobile" | "work" | "home" | "fax" | "other"

/** Mirror a `contacts.primary_phone` write into `contact_phones` (is_primary + is_active = true). */
export async function syncPrimaryContactPhone(
  db: SupabaseClient,
  orgId: string,
  contactId: string,
  phone: string | null | undefined,
  phoneType: ContactPhoneType = "mobile",
): Promise<void> {
  const trimmed = phone?.trim()
  if (!trimmed) return

  const { error: clearError } = await db
    .from("contact_phones")
    .delete()
    .eq("contact_id", contactId)
    .eq("org_id", orgId)
    .eq("is_primary", true)
  if (clearError) {
    console.error("[syncPrimaryContactPhone] clear existing primary failed:", clearError.message)
    return
  }

  const { error } = await db.from("contact_phones").insert({
    org_id: orgId,
    contact_id: contactId,
    number: trimmed,
    phone_type: phoneType,
    is_primary: true,
    is_active: true,
  })
  if (error) console.error("[syncPrimaryContactPhone] insert failed:", error.message)
}
