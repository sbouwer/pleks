"use server"

/**
 * lib/contractors/sendPortalInvite.ts — invite a contractor/supplier to the supplier portal
 *
 * Auth:   agent server action (caller passes agentId); service client for the privileged auth invite
 * Data:   contractor_view (read), contractors (portal_access_enabled/portal_invite_sent_at), Supabase auth
 *         admin invite, audit_log
 * Notes:  Sends via Supabase auth.admin.inviteUserByEmail → Supabase's GENERIC (unbranded) invite email.
 *         A branded custom-token send (mirroring the team-invite /invite/[token] flow) is a pending build
 *         (ADDENDUM_70 portal-invite item) — an auth-provisioning change, not a copy fold. Audit goes
 *         through recordAudit (canonical columns, no PII in values — the email lives on the contractor row).
 */

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function sendPortalInvite(
  contractorId: string,
  agentId: string
) {
  const supabase = await createClient()
  const adminClient = await createServiceClient()

  const { data: contractor, error: contractorError } = await supabase
    .from("contractor_view")
    .select("id, org_id, email, first_name, last_name, company_name, portal_access_enabled")
    .eq("id", contractorId)
    .single()
    logQueryError("sendPortalInvite contractor_view", contractorError)

  if (!contractor) return { error: "Contractor not found" }
  if (contractor.portal_access_enabled) return { error: "Contractor already has portal access" }
  if (!contractor.email) return { error: "Contractor has no email address" }

  const displayName = contractor.company_name || `${contractor.first_name} ${contractor.last_name}`.trim()

  // Create Supabase auth invite
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    contractor.email,
    {
      data: {
        role: "contractor",
        contractor_id: contractorId,
        org_id: contractor.org_id,
        full_name: displayName,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/supplier/setup`,
    }
  )

  if (inviteError) return { error: inviteError.message }

  // Update contractor record
  await supabase.from("contractors").update({
    portal_access_enabled: true,
    portal_invite_sent_at: new Date().toISOString(),
  }).eq("id", contractorId)

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
