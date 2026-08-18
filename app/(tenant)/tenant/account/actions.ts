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
    const { error } = payload.primaryPhoneId
      ? await service.from("contact_phones")
          .update({ number: payload.phone })
          .eq("id", payload.primaryPhoneId)
          .eq("org_id", session.orgId)
          .eq("contact_id", payload.contactId)
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
  }

  if (payload.email !== null) {
    const { error } = payload.primaryEmailId
      ? await service.from("contact_emails")
          .update({ email: payload.email })
          .eq("id", payload.primaryEmailId)
          .eq("org_id", session.orgId)
          .eq("contact_id", payload.contactId)
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
  }

  // Audit log
  await recordAudit(service, { orgId: session.orgId, table: "contacts", recordId: payload.contactId, action: "UPDATE", actorId: session.tenantId, after: {
      action: "tenant_portal_contact_update",
      fields_changed: [payload.phone !== null && "phone", payload.email !== null && "email"].filter(Boolean),
    } })

  return { success: true }
}
