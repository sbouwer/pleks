"use server"

/**
 * lib/portal/inviteLandlord.ts — invite a landlord to the owner portal
 *
 * Auth:   internal — reached only via gated callers (portal-invite route + requireAgentWriteAccess
 *         inviteLandlordPortal action wrapper); the client imports the wrapper, never this lib fn. Caller
 *         passes its authenticated agentId + orgId; service client for the privileged writes.
 * Data:   landlord_view (read, org-scoped), landlords (portal_status/portal_invited_at), Supabase auth
 *         admin invite, audit_log
 * Notes:  Provisions the user via Supabase auth.admin.generateLink({type:"invite"}) — identical to
 *         inviteUserByEmail — then sends the action link wrapped in a branded, agency-branded EmailLayout
 *         (ADDENDUM_70I), rather than letting Supabase send its generic email. No acceptance route / no
 *         session-model change (mirrors stepSendPortalInvite). Audit via recordAudit (no PII in values).
 *         orgId scopes the landlord read — a cross-org landlordId resolves to "not found" (the service
 *         client bypasses RLS, so the explicit filter is the boundary).
 */
import * as React from "react"
import { createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { sendEmail, buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { PortalLandlordInviteEmail } from "@/lib/comms/templates/portal/role-invites"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { APP_URL } from "@/lib/env"

export async function inviteLandlord(landlordId: string, agentId: string, orgId: string) {
  const service = await createServiceClient()

  const { data: landlord, error: landlordError } = await service
    .from("landlord_view")
    .select("id, org_id, email, first_name, last_name, company_name")
    .eq("id", landlordId)
    .eq("org_id", orgId)
    .single()
  logQueryError("inviteLandlord landlord_view", landlordError)

  if (!landlord) return { error: "Landlord not found" }
  // portal_status lives on the landlords table, not the view.
  const { data: llRow, error: llErr } = await service
    .from("landlords").select("portal_status").eq("id", landlordId).maybeSingle()
  logQueryError("inviteLandlord landlords portal_status", llErr)
  if (llRow?.portal_status === "active") return { error: "Landlord already has portal access" }
  if (!landlord.email) return { error: "Landlord has no email address on file" }

  const displayName = (landlord.company_name || `${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim()) || "Landlord"

  // Provision the user (same as inviteUserByEmail) but get the action link to send branded ourselves.
  const { data: linkData, error: inviteError } = await service.auth.admin.generateLink({
    type: "invite",
    email: landlord.email,
    options: {
      data: {
        role: "landlord",
        landlord_id: landlordId,
        org_id: landlord.org_id,
        full_name: displayName,
      },
      redirectTo: `${APP_URL}/landlord/dashboard`,
    },
  })

  if (inviteError) return { error: inviteError.message }

  // Branded agency invite email (replaces Supabase's generic invite email).
  const branding = buildBranding(await fetchOrgSettings(landlord.org_id))
  try {
    await sendEmail({
      orgId: landlord.org_id,
      templateKey: "portal.landlord_invite",
      to: { email: landlord.email, name: displayName },
      subject: `Set up your owner portal — ${branding.orgName}`,
      emailElement: React.createElement(PortalLandlordInviteEmail, {
        branding,
        recipientName: displayName,
        portalUrl: linkData.properties.action_link,
        senderName: branding.orgName,
      }),
    })
  } catch (e) {
    // Soft failure — the user is provisioned; the invite link can be re-sent. Never throw past the action.
    console.error("[inviteLandlord] branded invite email failed:", e)
  }

  await service.from("landlords").update({
    portal_status: "invited",
    portal_invited_at: new Date().toISOString(),
  }).eq("id", landlordId)

  await recordAudit(service, {
    orgId: landlord.org_id,
    actorId: agentId,
    action: "UPDATE",
    table: "landlords",
    recordId: landlordId,
    after: { action: "portal_invite_sent" },   // no PII in values — the email lives on the landlord row
  })

  return { success: true }
}
