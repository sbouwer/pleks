"use server"

/**
 * app/(tenant)/tenant/account/actions.ts — tenant portal: update the tenant's own contact details
 *
 * Route:  /tenant/account (server actions)
 * Auth:   getTenantSession() — portal session. The contact is resolved from the SESSION's tenant row,
 *         never from the request, so a caller cannot name a contact or a channel row at all.
 * Data:   tenants, contact_phones, contact_emails (via syncPrimaryContact{Phone,Email}), audit_log.
 * Notes:  Rewritten 2026-08-18 after an adversarial review of #252. The history is worth keeping,
 *         because every defect below was invisible and several were only REACHABLE once the previous
 *         one was fixed:
 *
 *           1 · CROSS-ORG IDOR — updates were scoped `.eq("id", …)` alone on the SERVICE client
 *               (bypasses RLS), with the row id supplied by the CLIENT and never validated.
 *           2 · INSERTS OMITTED org_id (NOT NULL) so every first-time entry failed. This is the
 *               answer to "tenant self-service email update has NEVER stored a row" in OUTSTANDING.
 *           3 · NO { error } CHECK on any write — which is what hid 1 and 2.
 *           4 · A zero-row UPDATE is `{ error: null }` in PostgREST, so once 1 was fixed a foreign
 *               id wrote nothing and STILL reported success.
 *           5 · The audit write passed `actorId: session.tenantId` into `changed_by`, which is
 *               `REFERENCES auth.users(id)` — every insert violated the FK, on every call.
 *           6 · Accepting a client row id AT ALL. Fixing 1–5 left the action writing exactly once per
 *               page load: nothing refreshed the client's ids, so a second save re-took the INSERT
 *               branch and hit the unique primary index. And because the agent-side sync helpers
 *               DELETE-then-INSERT, a legitimate id goes stale the moment an agent edits — the tenant
 *               then saw a hard error until they reloaded.
 *
 *         6's fix removes the class rather than the symptom: THE ROW ID IS NO LONGER AN INPUT. The
 *         primary channel row is replaced by `syncPrimaryContact{Phone,Email}`, which clear-then-insert
 *         and are idempotent by construction — no resolve step, no branch, no unique-index collision
 *         possible, and nothing for a caller to point at. Same doctrine the agent routes already
 *         state: "never trust a client-sent contactId … deriving it server-side also stops a caller
 *         targeting another landlord's contact."
 */

import { createServiceClient } from "@/lib/supabase/server"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { recordAudit } from "@/lib/audit/recordAudit"
import { syncPrimaryContactPhone } from "@/lib/contacts/syncPrimaryPhone"
import { syncPrimaryContactEmail } from "@/lib/contacts/syncPrimaryEmail"

interface UpdateContactPayload {
  phone: string | null
  email: string | null
}

/** Deliberately permissive — this rejects shapes that CANNOT be an address, not the ones RFC 5322
 *  disallows. A stricter pattern becomes a support burden of valid addresses refused.
 *
 *  ⚠ LINEAR STRING OPS, NOT A REGEX. `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` puts two unbounded negated classes
 *  either side of a literal — catastrophic-backtracking structure, on a validator any signed-in tenant
 *  can invoke with a string of their choosing. `lib/audit/recordAudit.ts`'s `looksLikeEmail` already hit
 *  this and solved it exactly this way, saying so in its own comment; this mirrors the in-repo precedent
 *  rather than suppressing the rule that caught it. */
function looksLikeEmail(s: string): boolean {
  const at = s.indexOf("@")
  if (at <= 0 || at !== s.lastIndexOf("@")) return false
  if (s.includes(" ") || s.includes("\t")) return false
  const domain = s.slice(at + 1)
  const dot = domain.indexOf(".")
  return dot > 0 && dot < domain.length - 1
}

export async function updatePortalContactDetails(payload: UpdateContactPayload) {
  const session = await getTenantSession()
  if (!session) return { error: "Not authenticated" }

  // ⚠ VALIDATE ON THE SERVER, NOT ONLY IN THE FORM. A server action is directly invokable, and the
  // `.trim()` that used to be the only cleaning lived in PortalAccountClient. This value does not stop
  // at a profile page: the derive trigger writes it to `contacts.primary_email`, and
  // `resolveNoticeContext` unions every active contact_emails row into the STATUTORY NOTICE recipient
  // set. So "  NotAnEmail  " would become a service address, the notice pack would render it, and
  // `needsManualAttestation` would stay FALSE because the set is non-empty — the deemed-service model
  // reporting that nothing needs attention while holding an address that can never be served.
  // That is false evidence of serviceability, not a formatting nit.
  const phone = payload.phone?.trim() || null
  const email = payload.email?.trim() || null
  if (email !== null && !looksLikeEmail(email)) {
    return { error: "That does not look like an email address." }
  }
  if (phone !== null && phone.replace(/[\s()+-]/g, "").length < 9) {
    return { error: "That does not look like a phone number." }
  }
  if (phone === null && email === null) return { success: true }

  const service = await createServiceClient()

  // The contact comes from the SESSION's tenant row. Nothing about it is caller-supplied, so there is
  // no id to validate, none to get stale, and none to point at another organisation.
  const { data: tenant, error: tenantErr } = await service
    .from("tenants")
    .select("contact_id")
    .eq("id", session.tenantId)
    .eq("org_id", session.orgId)
    .single()

  if (tenantErr || !tenant?.contact_id) return { error: "Unauthorised" }
  const contactId = tenant.contact_id as string

  // Both helpers clear the existing primary row and insert a replacement, carrying `label` /
  // `can_whatsapp` across, and return { error } so a failure is surfaced rather than logged and lost.
  const phoneResult = phone !== null
    ? await syncPrimaryContactPhone(service, session.orgId, contactId, phone, "mobile")
    : { error: null }

  // Do not attempt the second channel after the first failed — a second failure tells the tenant
  // nothing new, and the audit block below still records whatever did land.
  const emailResult = email !== null && !phoneResult.error
    ? await syncPrimaryContactEmail(service, session.orgId, contactId, email, "personal")
    : { error: null }

  // ⚠ AUDIT BEFORE RETURNING, EVEN ON A PARTIAL FAILURE. The previous version returned early on the
  // email error — so a phone write that had ALREADY landed (and already moved contacts.primary_phone
  // through the derive trigger) produced no audit_log row at all, against the very rule cited below.
  // Whatever landed is recorded first; the error is reported after.
  const landed = [
    phone !== null && !phoneResult.error ? "phone" : null,
    email !== null && !emailResult.error ? "email" : null,
  ].filter((c): c is string => c !== null)

  if (landed.length > 0) {
    // `actorId` becomes audit_log.changed_by → REFERENCES auth.users(id) (001_foundation.sql:151).
    // A TenantPortalSession carries NO auth user id — an `authType: "token"` session has no auth user
    // at all — so null is the only value that can satisfy the FK.
    //
    // ⚠ NULL IS NOT FREE, AND THIS COMMENT NO LONGER CLAIMS OTHERWISE: the admin audit surface renders
    // `changed_by ?? "system"` and does not select `actor_name`, so this row READS as a system write
    // today. `actorName` is passed for when that surface is fixed — it is not attribution yet.
    // Tracked in OUTSTANDING; do not read its presence here as the problem being solved.
    //
    // ⚠ The values are marker-only ON PURPOSE. recordAudit's CONTACT_PII_KEY denylist silently DROPS
    // any key matching /email|phone/, so `after: { email: newValue }` would vanish without warning.
    // Recording THAT the channel changed, under keys that survive, beats recording nothing while
    // believing otherwise. The denylist's silence is its own defect — logged separately.
    await recordAudit(service, {
      orgId: session.orgId, table: "contacts", recordId: contactId, action: "UPDATE",
      actorId: null,
      actorName: session.tenantName,
      after: {
        action: "tenant_portal_contact_update",
        actor_tenant_id: session.tenantId,
        auth_type: session.authType,
        channels_changed: landed,
      },
    })
  }

  if (phoneResult.error) return { error: "Could not save your phone number." }
  if (emailResult.error) return { error: "Could not save your email address." }
  return { success: true }
}
