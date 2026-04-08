"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { addDays } from "date-fns"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendShortlistInvitation as sendShortlistEmail } from "@/lib/applications/emails"

export async function sendShortlistInvitation(
  applicationId: string,
  agentId: string
) {
  const supabase = await createClient()

  const { data: application } = await supabase
    .from("applications")
    .select("id, applicant_email, first_name, org_id, listing_id")
    .eq("id", applicationId)
    .single()

  if (!application) return { error: "Application not found" }

  // Create shortlist invite token (7-day expiry)
  const { data: inviteToken } = await supabase
    .from("application_tokens")
    .insert({
      application_id: applicationId,
      token_type: "shortlist_invite",
      applicant_email: application.applicant_email,
      expires_at: addDays(new Date(), 7).toISOString(),
    })
    .select("token")
    .single()

  if (!inviteToken) return { error: "Failed to create invite token" }

  // Update application status
  await supabase.from("applications").update({
    stage1_status: "shortlisted",
    stage2_status: "invited",
    fee_status: "pending",
    prescreened_by: agentId,
    prescreened_at: new Date().toISOString(),
  }).eq("id", applicationId)

  // Send Email 4: Shortlist invitation
  try {
    const ctx = await buildEmailContext(applicationId)
    if (ctx) {
      void sendShortlistEmail(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {
        inviteToken: inviteToken.token,
      })
    }
  } catch (e) { console.error("sendShortlistEmail failed:", e) }

  // Log to communication_log
  await supabase.from("communication_log").insert({
    org_id: application.org_id,
    channel: "email",
    direction: "outbound",
    subject: `Shortlist invitation sent to ${application.applicant_email}`,
    body: `Shortlisted for listing ${application.listing_id}`,
    status: "sent",
    sent_to_email: application.applicant_email,
  })

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: application.org_id,
    table_name: "applications",
    record_id: applicationId,
    action: "UPDATE",
    changed_by: agentId,
    new_values: { stage1_status: "shortlisted", stage2_status: "invited" },
  })

  revalidatePath("/applications")
  return { success: true }
}
