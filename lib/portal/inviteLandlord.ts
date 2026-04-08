"use server"

import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function inviteLandlord(landlordId: string, agentId: string) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: landlord } = await supabase
    .from("landlord_view")
    .select("id, org_id, email, first_name, last_name, company_name, portal_status")
    .eq("id", landlordId)
    .single()

  if (!landlord) return { error: "Landlord not found" }
  if (landlord.portal_status === "active") return { error: "Landlord already has portal access" }
  if (!landlord.email) return { error: "Landlord has no email address on file" }

  const displayName = (landlord.company_name || `${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim()) || "Landlord"

  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(
    landlord.email,
    {
      data: {
        role: "landlord",
        landlord_id: landlordId,
        org_id: landlord.org_id,
        full_name: displayName,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/landlord/dashboard`,
    }
  )

  if (inviteError) return { error: inviteError.message }

  await service.from("landlords").update({
    portal_status: "invited",
    portal_invited_at: new Date().toISOString(),
  }).eq("id", landlordId)

  await supabase.from("audit_log").insert({
    org_id: landlord.org_id,
    table_name: "landlords",
    record_id: landlordId,
    action: "UPDATE",
    changed_by: agentId,
    new_values: { action: "portal_invite_sent", sent_to: landlord.email },
  })

  return { success: true }
}
