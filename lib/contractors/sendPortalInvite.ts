"use server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function sendPortalInvite(
  contractorId: string,
  agentId: string
) {
  const supabase = await createClient()
  const adminClient = await createServiceClient()

  const { data: contractor } = await supabase
    .from("contractors")
    .select("id, org_id, email, name, portal_access_enabled")
    .eq("id", contractorId)
    .single()

  if (!contractor) return { error: "Contractor not found" }
  if (contractor.portal_access_enabled) return { error: "Contractor already has portal access" }
  if (!contractor.email) return { error: "Contractor has no email address" }

  // Create Supabase auth invite
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    contractor.email,
    {
      data: {
        role: "contractor",
        contractor_id: contractorId,
        org_id: contractor.org_id,
        full_name: contractor.name,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/contractor/setup`,
    }
  )

  if (inviteError) return { error: inviteError.message }

  // Update contractor record
  await supabase.from("contractors").update({
    portal_access_enabled: true,
    portal_invite_sent_at: new Date().toISOString(),
  }).eq("id", contractorId)

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: contractor.org_id,
    table_name: "contractors",
    record_id: contractorId,
    action: "UPDATE",
    changed_by: agentId,
    new_values: { action: "portal_invite_sent", sent_to: contractor.email },
  })

  return { success: true }
}
