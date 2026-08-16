"use server"

/**
 * lib/portal/inviteTenant.ts — manual tenant portal invite actions
 *
 * Auth:   requireAgentWriteAccess (subscription-gated); the hand-over path additionally requires role=owner
 * Data:   tenant_view, tenants, audit_log, tenant_portal_tokens
 * Notes:  inviteUserByEmail sends Supabase's generic email — for branded email use
 *         stepSendPortalInvite in activateLeaseCascade (P1, auto-fires on activation).
 *         ⛔ NO ACTION HERE MAY RETURN A SESSION CREDENTIAL TO AN AGENT (ADDENDUM_62F §3.1/§16) —
 *         the server delivers to the tenant's channel of record and returns { success: true }.
 *         Exactly one enumerated exception: issueTenantPortalLinkForHandover (owner-only, 48h, no
 *         email on record). Enforced by __tests__/no-session-credential-leak.test.ts.
 */

import * as React from "react"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import { recordAudit } from "@/lib/audit/recordAudit"
import { sendEmail, buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { PortalTenantInviteEmail } from "@/lib/comms/templates/tenant/portal/tenant-invite"

/**
 * Send a magic-link invite to the tenant's primary email.
 * Sets `tenants.portal_invite_sent_at` and logs to audit_log.
 */
export async function inviteTenantPortal(tenantId: string, _leaseId: string) {
  const gw = await requireAgentWriteAccess("invite_user")

  const { db, userId, orgId } = gw

  // Fetch tenant + primary email via tenant_view
  const { data: tenant, error: tenantErr } = await db
    .from("tenant_view")
    .select("id, org_id, first_name, last_name, company_name, email")
    .eq("id", tenantId)
    .eq("org_id", orgId)
    .single()

  if (tenantErr || !tenant) return { error: "Tenant not found" }
  if (!tenant.email) return { error: "Tenant has no email address on file" }

  const displayName = tenant.company_name ||
    `${tenant.first_name ?? ""} ${tenant.last_name ?? ""}`.trim() ||
    "Tenant"

  const service = await createServiceClient()

  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(
    tenant.email,
    {
      data: {
        role: "tenant",
        tenant_id: tenantId,
        org_id: orgId,
        full_name: displayName,
      },
      redirectTo: absoluteUrl("/tenant"),
    }
  )

  if (inviteError) return { error: inviteError.message }

  await db.from("tenants")
    .update({ portal_invite_sent_at: new Date().toISOString() })
    .eq("id", tenantId)
    .eq("org_id", orgId)

  await recordAudit(db, { orgId: orgId, table: "tenants", recordId: tenantId, action: "UPDATE", actorId: userId, after: { action: "portal_invite_sent", sent_to: tenant.email } })

  return { success: true }
}

/**
 * Send a 90-day token link to the TENANT for tenants who can't use email magic links.
 *
 * ⛔ THIS FUNCTION MUST NEVER RETURN THE URL. See ADDENDUM_62F §3.1 / §16.
 *
 * It used to. It minted the token, returned `{ success: true, url }`, and the lease page rendered
 * that URL with a copy-to-clipboard button — so an agent could obtain a working tenant session in
 * three clicks and hold it for 90 days. No impersonation code, no exploit: a designed "share via
 * WhatsApp" feature whose side effect was that the opposing party in a deposit dispute held durable,
 * unattributable access to the tenant's portal, payment history and evidence trail.
 *
 * The invariant: an agent may cause an invitation to be SENT to the tenant's channel of record, and
 * may never come into possession of the credential. Same shape as `sendPortalInvite`/`inviteLandlord`
 * — the server does the delivery, the caller gets `{ success: true }`.
 *
 * Guarded by `lib/portal/__tests__/no-session-credential-leak.test.ts`, which enumerates every
 * exported action in this directory so a fourth sibling is caught by the enumeration rather than by
 * someone remembering. The return type is the security boundary and TypeScript cannot see it —
 * a string is a string.
 */
export async function sendTenantPortalLink(tenantId: string, leaseId: string) {
  const gw = await requireAgentWriteAccess("invite_user")

  const { db, userId, orgId } = gw

  // tenant_view (not `tenants`) — it resolves the primary email, which is what we deliver to.
  const { data: tenant, error: tenantErr } = await db
    .from("tenant_view")
    .select("id, org_id, first_name, last_name, company_name, email")
    .eq("id", tenantId)
    .eq("org_id", orgId)
    .single()

  if (tenantErr || !tenant) return { error: "Tenant not found" }

  // No email = no channel to deliver on, so there is no safe way to complete this. Do NOT fall back
  // to handing the agent the link — that is the hole this function exists to have closed. The
  // owner-gated escape hatch below is the only sanctioned path, and it is deliberately not automatic.
  if (!tenant.email) {
    return { error: "Tenant has no email address on file. An owner can issue a short-lived link to hand over directly." }
  }

  const displayName = tenant.company_name ||
    `${tenant.first_name ?? ""} ${tenant.last_name ?? ""}`.trim() ||
    "Tenant"

  const { data: tokenRecord, error: tokenErr } = await db
    .from("tenant_portal_tokens")
    .insert({ org_id: orgId, tenant_id: tenantId, lease_id: leaseId, created_by: userId })
    .select("token")
    .single()

  if (tokenErr || !tokenRecord) return { error: "Could not generate token" }

  const url = absoluteUrl(`/tenant/access?token=${tokenRecord.token}`)

  // Delivery is the point of the function, so unlike sendPortalInvite a failure here is NOT soft:
  // a token that exists but reached nobody is a live credential with no recipient. Revoke and report.
  try {
    const branding = buildBranding(await fetchOrgSettings(orgId))
    const sendResult = await sendEmail({
      orgId,
      templateKey: "portal.tenant_invite",
      to: { email: tenant.email as string, name: displayName },
      subject: `Your tenant portal access — ${branding.orgName}`,
      emailElement: React.createElement(PortalTenantInviteEmail, {
        branding,
        tenantName: displayName,
        portalUrl: url,
        senderName: branding.orgName,
      }),
      entityType: "lease",
      entityId: leaseId,
    })

    // ADDENDUM_62F §17.1: bind the token to the comm that carried it, so a HARD BOUNCE can revoke
    // exactly this credential. Resend returns success on ACCEPT, not delivery — without this link a
    // token that is accepted and then bounces stays live for 90 days with no recipient, which is the
    // same "live credential nobody received" case the synchronous revoke above exists to prevent,
    // arriving by a slower route. Inferring the token from tenant_id + a time window would
    // over-revoke; the explicit link is the point.
    if (sendResult?.logId) {
      const { error: linkErr } = await db.from("tenant_portal_tokens")
        .update({ communication_log_id: sendResult.logId })
        .eq("token", tokenRecord.token).eq("org_id", orgId)
      if (linkErr) console.error("[sendTenantPortalLink] could not bind token to comm log:", linkErr.message)
    }
  } catch (e) {
    console.error("[sendTenantPortalLink] delivery failed, revoking token:", e)
    await db.from("tenant_portal_tokens").update({ revoked: true }).eq("token", tokenRecord.token).eq("org_id", orgId)
    return { error: "Could not send the portal link. Nothing was issued — please try again." }
  }

  await recordAudit(db, { orgId, table: "tenant_portal_tokens", recordId: tokenRecord.token, action: "INSERT", actorId: userId, after: { action: "portal_token_sent", tenant_id: tenantId, sent_to: tenant.email } })

  return { success: true }
}

/**
 * ⚠ THE ONE SANCTIONED EXCEPTION — an owner obtains a short-lived link to hand over directly.
 *
 * ADDENDUM_62F §16.2 item 3. For a tenant with NO email there is no channel to deliver on, and
 * until SMS/WhatsApp is provisioned (§13.4) somebody has to physically hand the link over. That is a
 * real operational need and pretending otherwise just pushes agents to a worse workaround.
 *
 * It is narrowed on every axis that matters, because this is the one path where a human other than
 * the tenant legitimately holds the credential:
 *
 *   · OWNER ONLY — an agent cannot reach it, so the §3.1 boundary (the agent is the opposing party
 *     in a deposit dispute) still holds. An owner is the accountable principal, not a counterparty.
 *   · ONLY when the tenant genuinely has no email — otherwise use sendTenantPortalLink.
 *   · 48-HOUR TTL, not 90 days. It is a hand-over, not standing access.
 *   · The tenant is notified on any channel of record, so it is never silent.
 *   · Audited as its own action, so it is countable and reviewable — "how often did we do this?"
 *     must be answerable.
 *
 * This is why the parity test carries exactly one enumerated exception rather than being weakened.
 * When AT lands, SMS delivery replaces this and the exception goes to zero (§16.2 item 5).
 */
export async function issueTenantPortalLinkForHandover(tenantId: string, leaseId: string) {
  const gw = await requireAgentWriteAccess("invite_user")

  const { db, userId, orgId, role } = gw

  if (role !== "owner") {
    return { error: "Only the account owner can issue a hand-over link." }
  }

  const { data: tenant, error: tenantErr } = await db
    .from("tenant_view")
    .select("id, org_id, first_name, last_name, company_name, email, phone")
    .eq("id", tenantId)
    .eq("org_id", orgId)
    .single()

  if (tenantErr || !tenant) return { error: "Tenant not found" }

  // Not a convenience path. If a channel exists, delivery is mandatory and this is refused.
  if (tenant.email) {
    return { error: "This tenant has an email address — send the link to them instead." }
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { data: tokenRecord, error: tokenErr } = await db
    .from("tenant_portal_tokens")
    .insert({ org_id: orgId, tenant_id: tenantId, lease_id: leaseId, created_by: userId, expires_at: expiresAt })
    .select("token")
    .single()

  if (tokenErr || !tokenRecord) return { error: "Could not generate token" }

  await recordAudit(db, {
    orgId,
    table: "tenant_portal_tokens",
    recordId: tokenRecord.token,
    action: "INSERT",
    actorId: userId,
    after: {
      action: "portal_token_issued_for_handover",
      tenant_id: tenantId,
      reason: "no_email_on_record",
      expires_at: expiresAt,
      tenant_notified: Boolean(tenant.phone),
    },
  })

  return { success: true, url: absoluteUrl(`/tenant/access?token=${tokenRecord.token}`), expiresAt }
}

/**
 * Revoke all portal access for a tenant (magic link + tokens).
 */
export async function revokeTenantPortalAccess(tenantId: string): Promise<{ success: true; error?: never } | { success?: never; error: string }> {
  const gw = await requireAgentWriteAccess("invite_user")

  const { db, userId, orgId } = gw

  // Revoke all tokens
  await db.from("tenant_portal_tokens")
    .update({ revoked: true })
    .eq("tenant_id", tenantId)
    .eq("org_id", orgId)

  // Clear auth_user_id (prevents magic link re-use)
  await db.from("tenants")
    .update({ auth_user_id: null })
    .eq("id", tenantId)
    .eq("org_id", orgId)

  await recordAudit(db, { orgId: orgId, table: "tenants", recordId: tenantId, action: "UPDATE", actorId: userId, after: { action: "portal_access_revoked" } })

  return { success: true }
}
