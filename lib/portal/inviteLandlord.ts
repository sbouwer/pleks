"use server"

/**
 * lib/portal/inviteLandlord.ts — invite a landlord to the owner portal
 *
 * Auth:   agent server action (caller passes agentId); service client for the privileged writes
 * Data:   landlord_view (read), landlords (portal_status/portal_invited_at), Supabase auth admin invite, audit_log
 * Notes:  Sends via Supabase auth.admin.inviteUserByEmail → Supabase's GENERIC (unbranded) invite email.
 *         A branded custom-token send (mirroring the team-invite /invite/[token] flow) is a pending build
 *         (ADDENDUM_70 portal-invite item) — it's an auth-provisioning change, not a copy fold. Audit goes
 *         through recordAudit (canonical columns, no PII in values — the email lives on the landlord row).
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function inviteLandlord(landlordId: string, agentId: string) {
  const supabase = await createClient()
  const service = await createServiceClient()

  const { data: landlord, error: landlordError } = await supabase
    .from("landlord_view")
    .select("id, org_id, email, first_name, last_name, company_name")
    .eq("id", landlordId)
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
