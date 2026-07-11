"use server"

/**
 * lib/contractors/sendPortalInvite.ts — invite a contractor/supplier to the supplier portal
 *
 * Auth:   internal — reached only via a gated caller (supplier portal-invite route); caller passes its
 *         authenticated agentId + orgId. Service client for the privileged auth invite.
 * Data:   contractor_view (read, org-scoped), contractors (portal_access_enabled/portal_invite_sent_at),
 *         Supabase auth admin invite, audit_log
 * Notes:  Provisions the user via Supabase auth.admin.generateLink({type:"invite"}) — identical to
 *         inviteUserByEmail — then sends the action link wrapped in a branded, agency-branded EmailLayout
 *         (ADDENDUM_70I), rather than letting Supabase send its generic email. No acceptance route / no
 *         session-model change (mirrors stepSendPortalInvite). Audit via recordAudit (no PII in values).
 *         NB: provisioning metadata kept as role:"contractor" + redirectTo /supplier/setup (the live values).
 *         orgId scopes the contractor read — a cross-org contractorId resolves to "not found".
 */

import * as React from "react"
import { createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { sendEmail, buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { PortalSupplierInviteEmail } from "@/lib/comms/templates/portal/role-invites"
import { logQueryError } from "@/lib/supabase/logQueryError"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"

export async function sendPortalInvite(
  contractorId: string,
  agentId: string,
  orgId: string
) {
  const adminClient = await createServiceClient()

  const { data: contractor, error: contractorError } = await adminClient
    .from("contractor_view")
    .select("id, org_id, email, first_name, last_name, company_name, portal_access_enabled")
    .eq("id", contractorId)
    .eq("org_id", orgId)
    .single()
  logQueryError("sendPortalInvite contractor_view", contractorError)

  if (!contractor) return { error: "Contractor not found" }
  if (contractor.portal_access_enabled) return { error: "Contractor already has portal access" }
  if (!contractor.email) return { error: "Contractor has no email address" }

  const displayName = contractor.company_name || `${contractor.first_name} ${contractor.last_name}`.trim()

  // Provision the user (same as inviteUserByEmail) but get the action link to send branded ourselves.
  const { data: linkData, error: inviteError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: contractor.email,
    options: {
      data: {
        role: "contractor",
        contractor_id: contractorId,
        org_id: contractor.org_id,
        full_name: displayName,
      },
      redirectTo: absoluteUrl("/supplier/setup"),
    },
  })

  if (inviteError) return { error: inviteError.message }

  // Branded agency invite email (replaces Supabase's generic invite email).
  const branding = buildBranding(await fetchOrgSettings(contractor.org_id))
  try {
    await sendEmail({
      orgId: contractor.org_id,
      templateKey: "portal.supplier_invite",
      to: { email: contractor.email, name: displayName },
      subject: `Set up your supplier portal — ${branding.orgName}`,
      emailElement: React.createElement(PortalSupplierInviteEmail, {
        branding,
        recipientName: displayName,
        portalUrl: linkData.properties.action_link,
        senderName: branding.orgName,
      }),
    })
  } catch (e) {
    // Soft failure — the user is provisioned; the invite link can be re-sent. Never throw past the action.
    console.error("[sendPortalInvite] branded invite email failed:", e)
  }

  // Update contractor record
  await adminClient.from("contractors").update({
    portal_access_enabled: true,
    portal_invite_sent_at: new Date().toISOString(),
  }).eq("id", contractorId).eq("org_id", orgId)

  // Audit the access-control grant (no PII in values — the email lives on the contractor row).
  await recordAudit(adminClient, {
    orgId: contractor.org_id,
    actorId: agentId,
    action: "UPDATE",
    table: "contractors",
    recordId: contractorId,
    after: { action: "portal_invite_sent" },
  })

  return { success: true }
}
