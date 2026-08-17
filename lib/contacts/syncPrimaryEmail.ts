/**
 * lib/contacts/syncPrimaryEmail.ts — dual-write helper for the primary_email → contact_emails expand
 *
 * Data:   contact_emails (org-scoped)
 * Notes:  ADDENDUM_CONTACT_REPRESENTATION_UNIFICATION §7 step 2 (expand phase). Every writer of
 *         `contacts.primary_email` calls this ALONGSIDE its existing column write — never instead of it;
 *         the column write stays the source of truth until step 3 (derive trigger) lands. No-ops on a
 *         blank email (primary_email is nullable; an empty row would misrepresent "no email" as "one
 *         email"). Idempotent under re-runs (imports, upserts): clears any existing primary row for the
 *         contact before inserting, so a re-run never accumulates duplicate primaries. This is NOT
 *         optional housekeeping — `idx_contact_emails_primary` (002_contacts.sql) is a unique index on
 *         `(contact_id) WHERE is_primary`, already live, so a bare insert-without-clear throws a unique
 *         violation on any second write for the same contact (the addendum that specs this step assumed
 *         no such index existed yet; it does).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type ContactEmailType = "personal" | "work" | "billing"

/** Mirror a `contacts.primary_email` write into `contact_emails` (is_primary + is_active = true). */
export async function syncPrimaryContactEmail(
  db: SupabaseClient,
  orgId: string,
  contactId: string,
  email: string | null | undefined,
  emailType: ContactEmailType = "personal",
): Promise<void> {
  const trimmed = email?.trim()
  if (!trimmed) return

  const { error: clearError } = await db
    .from("contact_emails")
    .delete()
    .eq("contact_id", contactId)
    .eq("org_id", orgId)
    .eq("is_primary", true)
  if (clearError) {
    console.error("[syncPrimaryContactEmail] clear existing primary failed:", clearError.message)
    return
  }

  const { error } = await db.from("contact_emails").insert({
    org_id: orgId,
    contact_id: contactId,
    email: trimmed,
    email_type: emailType,
    is_primary: true,
    is_active: true,
  })
  if (error) console.error("[syncPrimaryContactEmail] insert failed:", error.message)
}
