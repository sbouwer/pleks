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

/** `error` is null on success, and on the deliberate no-op for a blank value. */
export interface SyncResult { error: string | null }

export type ContactEmailType = "personal" | "work" | "billing"

/** Mirror a `contacts.primary_email` write into `contact_emails` (is_primary + is_active = true). */
export async function syncPrimaryContactEmail(
  db: SupabaseClient,
  orgId: string,
  contactId: string,
  email: string | null | undefined,
  emailType: ContactEmailType = "personal",
): Promise<SyncResult> {
  const trimmed = email?.trim()
  if (!trimmed) return { error: null }

  // ⚠ CARRY THE ROW'S METADATA ACROSS THE DELETE — see the twin note in syncPrimaryPhone.ts. The
  // replacement row used to be built from scratch, so `label` (set by the agent via
  // contactSubRecords.ts and rendered in the dashboard) was DESTROYED on every write.
  const { data: existing, error: readError } = await db
    .from("contact_emails")
    .select("label")
    .eq("contact_id", contactId).eq("org_id", orgId).eq("is_primary", true)
    .maybeSingle()
  // ⚠ BAIL RATHER THAN PROCEED. An unchecked failure here would leave `existing` undefined, so the
  // carry-forward below would write nulls — silently destroying the very metadata this lookup exists to
  // preserve. That is the original defect reached through a different door, which is precisely how the
  // first version of this fix was incomplete. A read failure must not license a destructive write.
  if (readError) {
    console.error("[syncPrimaryContactEmail] read existing primary failed:", readError.message)
    return { error: readError.message }
  }

  const { error: clearError } = await db
    .from("contact_emails")
    .delete()
    .eq("contact_id", contactId)
    .eq("org_id", orgId)
    .eq("is_primary", true)
  if (clearError) {
    console.error("[syncPrimaryContactEmail] clear existing primary failed:", clearError.message)
    return { error: clearError.message }
  }

  const { error } = await db.from("contact_emails").insert({
    org_id: orgId,
    contact_id: contactId,
    email: trimmed,
    email_type: emailType,
    is_primary: true,
    is_active: true,
    // Preserved, not defaulted. `email_type` stays caller-authoritative — call sites derive it from
    // whether the contact is a company, so it is a deliberate input rather than row metadata.
    label: existing?.label ?? null,
  })
  if (error) console.error("[syncPrimaryContactEmail] insert failed:", error.message)
  // Returned so a caller that NEEDS to know can check — the tenant portal must surface a failed save
  // rather than report success. Existing callers ignore it, so this is additive.
  return { error: error?.message ?? null }
}
