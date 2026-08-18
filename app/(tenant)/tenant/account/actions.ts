"use server"

/**
 * app/(tenant)/tenant/account/actions.ts — tenant portal: update the tenant's own contact details
 *
 * Route:  /tenant/account (server actions)
 * Auth:   getTenantSession() — portal session; writes scoped to session.tenantId + session.orgId (a
 *         caller-supplied orgId that mismatches the session is rejected).
 * Data:   tenants, contacts, contact_phones, contact_emails via the service client.
 */

import { createServiceClient } from "@/lib/supabase/server"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { recordAudit } from "@/lib/audit/recordAudit"

interface UpdateContactPayload {
  contactId: string
  orgId: string
  phone: string | null
  email: string | null
  primaryPhoneId: string | null
  primaryEmailId: string | null
}

/** Shown when a scoped write matches no row: the caller's view is out of date, so retrying the same
 *  submission cannot succeed. Distinct from a write failure, which IS worth retrying. */
const STALE_VIEW_MESSAGE = "This page is out of date — refresh and try again."

export async function updatePortalContactDetails(payload: UpdateContactPayload) {
  const session = await getTenantSession()
  if (!session) return { error: "Not authenticated" }

  // Verify the contactId belongs to this tenant's session
  if (payload.orgId !== session.orgId) return { error: "Unauthorised" }

  const service = await createServiceClient()

  // Verify the contact belongs to the tenant in this org
  const { data: tenant, error: tenantErr } = await service
    .from("tenants")
    .select("contact_id")
    .eq("id", session.tenantId)
    .eq("org_id", session.orgId)
    .single()

  if (tenantErr || !tenant || tenant.contact_id !== payload.contactId) {
    return { error: "Unauthorised" }
  }

  // ⚠ THREE DEFECTS FIXED HERE 2026-08-18 — read before simplifying any of it back.
  //
  // 1. INSERTS OMITTED org_id, which is NOT NULL on both tables (002_contacts.sql:189, :164). Every
  //    first-time entry therefore failed outright. Combined with (3) it failed SILENTLY, which is why
  //    "tenant self-service email update has never stored a row" sat unexplained in OUTSTANDING.md —
  //    not a propagation problem, the write never succeeded once.
  //
  // 2. UPDATES WERE SCOPED BY `.eq("id", …)` ALONE, on the SERVICE client, which bypasses RLS — and
  //    primaryPhoneId / primaryEmailId arrive from the CLIENT and were never checked against this
  //    contact. A tenant could post any contact_phones.id and rewrite another organisation's number.
  //    The session check above proves the caller owns `contactId`; it proves nothing about the row id.
  //    Both updates are now scoped by org_id AND contact_id, so a foreign id matches zero rows.
  //
  // 3. NO { error } CHECK on any of the four writes (CLAUDE.md supabase-queries rule). The action
  //    returned success regardless. Each is now checked and surfaced.
  if (payload.phone !== null) {
    const { data: phoneRows, error } = payload.primaryPhoneId
      ? await service.from("contact_phones")
          .update({ number: payload.phone })
          .eq("id", payload.primaryPhoneId)
          .eq("org_id", session.orgId)
          .eq("contact_id", payload.contactId)
          .select("id")
      : await service.from("contact_phones").insert({
          org_id: session.orgId,
          contact_id: payload.contactId,
          number: payload.phone,
          phone_type: "mobile",
          is_primary: true,
          can_whatsapp: true,
        })
    if (error) {
      console.error("[updatePortalContactDetails] phone write failed:", error.message)
      return { error: "Could not save your phone number." }
    }
    // 4 · A SCOPED UPDATE THAT MATCHES NOTHING IS NOT AN ERROR TO PostgREST — it returns
    //     { error: null } and zero rows. So after fix (1), a foreign-org row id correctly writes
    //     NOTHING and the caller was still told "saved". The boundary held; the report lied. Same
    //     class as (3), one layer subtler: (3) was a failure reported as success, this is a no-op
    //     reported as success. .select("id") makes the affected-row count observable.
    //     ⚠ A DISTINCT MESSAGE, DELIBERATELY. A zero-row match is a CONFLICT signal, not a write
    //     failure, and the two need opposite things from the tenant: a failed write should be
    //     retried, a stale view must NOT be — resubmitting the same stale id fails identically and
    //     forever. Saying "could not save" to someone holding an out-of-date page teaches them to
    //     retry the one action that cannot work.
    //
    //     ⚠ AND DO NOT "HELPFULLY" FALL THROUGH TO AN INSERT HERE. The row can be gone because
    //     anonymisePlan ran (it deletes contact_phones rows on a POPIA s24 erasure), so inserting
    //     on a miss would let a browser tab left open resurrect a value that erasure removed. The
    //     other causes — the tenant edited elsewhere, an agent edited — are lost updates, the same
    //     silent-failure class this whole function was fixed for. A detected conflict must not be
    //     converted into a silent overwrite.
    if (payload.primaryPhoneId && (phoneRows?.length ?? 0) === 0) {
      console.error("[updatePortalContactDetails] phone update matched no row —",
        "id not owned by this contact/org:", payload.primaryPhoneId)
      return { error: STALE_VIEW_MESSAGE }
    }
  }

  if (payload.email !== null) {
    const { data: emailRows, error } = payload.primaryEmailId
      ? await service.from("contact_emails")
          .update({ email: payload.email })
          .eq("id", payload.primaryEmailId)
          .eq("org_id", session.orgId)
          .eq("contact_id", payload.contactId)
          .select("id")
      : await service.from("contact_emails").insert({
          org_id: session.orgId,
          contact_id: payload.contactId,
          email: payload.email,
          email_type: "personal",
          is_primary: true,
        })
    if (error) {
      console.error("[updatePortalContactDetails] email write failed:", error.message)
      return { error: "Could not save your email address." }
    }
    // See the phone branch above — a zero-row match is a stale view, not a write failure, and must
    // not fall through to an insert.
    if (payload.primaryEmailId && (emailRows?.length ?? 0) === 0) {
      console.error("[updatePortalContactDetails] email update matched no row —",
        "id not owned by this contact/org:", payload.primaryEmailId)
      return { error: STALE_VIEW_MESSAGE }
    }
  }

  // 5 · THE AUDIT WRITE COULD NEVER SUCCEED. It passed `actorId: session.tenantId`, but `actorId`
  //     becomes `audit_log.changed_by`, which is `uuid REFERENCES auth.users(id)`
  //     (001_foundation.sql:151) — and `tenantId` is a `tenants.id`, not an auth user id. Every
  //     insert violated the FK. It went unnoticed for the same reason as defects 2 and 3: nothing
  //     checked, nothing surfaced, and the writes it was auditing never landed either.
  //
  //     ⚠ FIXING THE WRITES MADE THIS URGENT rather than academic — as of this commit tenant contact
  //     changes actually happen, so an unaudited path is now a real gap against "audit_log on every
  //     state change" (CLAUDE.md security rule 3), not a dead branch.
  //
  //     There is NO auth user id to pass: TenantPortalSession has no such field, and an
  //     `authType: "token"` session has no auth user at all by construction. `null` is therefore the
  //     correct actor id — recordAudit documents it for exactly this case — and `actorName` carries
  //     the attribution instead, with the tenant id in the values so the row is still traceable.
  //     `recordAudit` returns Promise<void> and logs its own failures ("[recordAudit] supabase query
  //     failed: …"), so there is no { error } to check here — which is precisely how this stayed
  //     invisible. The FK violation was being printed on every call and read by nobody.
  await recordAudit(service, {
    orgId: session.orgId, table: "contacts", recordId: payload.contactId, action: "UPDATE",
    actorId: null,
    actorName: session.tenantName,
    after: {
      action: "tenant_portal_contact_update",
      actor_tenant_id: session.tenantId,
      auth_type: session.authType,
      fields_changed: [payload.phone !== null && "phone", payload.email !== null && "email"].filter(Boolean),
    },
  })

  return { success: true }
}
