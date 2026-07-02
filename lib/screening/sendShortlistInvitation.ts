"use server"

/**
 * lib/screening/sendShortlistInvitation.ts — shortlist a stage-1 application and send the stage-2 invite
 *
 * Route:  server action, invoked from ApplicationActions.tsx / BulkDecidePanel.tsx
 * Auth:   requireAgentWriteAccess("send_manual_comm") — this is a "use server" export (directly POSTable),
 *         so it MUST assert its own gate. The acting agent + org come from the authenticated session; the
 *         application is org-scoped to that session, so a cross-org applicationId resolves to "not found".
 * Data:   applications / application_tokens / communication_log / audit_log (service db, org-scoped).
 * Notes:  previously took a caller-supplied agentId and did NO auth at all — a zero-auth cross-org
 *         shortlist/invite with a forgeable prescreened_by. Never trust a caller-supplied identity here.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { revalidatePath } from "next/cache"
import { addDays } from "date-fns"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendShortlistInvitation as sendShortlistEmail } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function sendShortlistInvitation(applicationId: string) {
  let gw
  try {
    gw = await requireAgentWriteAccess("send_manual_comm")
  } catch (e) {
    return { error: e instanceof SubscriptionLockdownError ? e.message : "Not authorized" }
  }
  const { db, userId, orgId } = gw

  // Org-scoped fetch — a cross-org applicationId resolves to null (verifies org ownership)
  const { data: application, error: applicationError } = await db
    .from("applications")
    .select("id, applicant_email, first_name, org_id, listing_id")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .single()
    logQueryError("sendShortlistInvitation applications", applicationError)

  if (!application) return { error: "Application not found" }

  // Create shortlist invite token (7-day expiry)
  const { data: inviteToken, error: inviteTokenError } = await db
    .from("application_tokens")
    .insert({
      application_id: applicationId,
      token_type: "shortlist_invite",
      applicant_email: application.applicant_email,
      expires_at: addDays(new Date(), 7).toISOString(),
    })
    .select("token")
    .single()
    logQueryError("sendShortlistInvitation application_tokens", inviteTokenError)

  if (!inviteToken) return { error: "Failed to create invite token" }

  // Update application status — agent derived from the session, org-scoped
  await db.from("applications").update({
    stage1_status: "shortlisted",
    stage2_status: "invited",
    fee_status: "pending",
    prescreened_by: userId,
    prescreened_at: new Date().toISOString(),
  }).eq("id", applicationId).eq("org_id", orgId)

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
  await db.from("communication_log").insert({
    org_id: orgId,
    channel: "email",
    direction: "outbound",
    subject: `Shortlist invitation sent to ${application.applicant_email}`,
    body: `Shortlisted for listing ${application.listing_id}`,
    status: "sent",
    sent_to_email: application.applicant_email,
  })

  // Audit log
  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "applications",
    record_id: applicationId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { stage1_status: "shortlisted", stage2_status: "invited" },
  })

  revalidatePath("/listings")
  return { success: true }
}
