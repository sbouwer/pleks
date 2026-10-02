"use server"

/**
 * lib/screening/sendShortlistInvitation.ts — shortlist a stage-1 application and send the stage-2 invite
 *
 * Route:  server action, invoked from ApplicationActions.tsx / BulkDecidePanel.tsx
 * Auth:   requireAgentWriteAccess("send_manual_comm") — this is a "use server" export (directly POSTable),
 *         so it MUST assert its own gate. The acting agent + org come from the authenticated session; the
 *         application is org-scoped to that session, so a cross-org applicationId resolves to "not found".
 * Data:   applications / application_tokens / application_co_applicants / communication_log / audit_log
 *         (service db, org-scoped).
 * Notes:  previously took a caller-supplied agentId and did NO auth at all — a zero-auth cross-org
 *         shortlist/invite with a forgeable prescreened_by. Never trust a caller-supplied identity here.
 *         BUILD_72 P1-R8b-2: every live co row whose inviteRoute is "co_applicant" (a joint co-applicant or residential guarantor) is invited
 *         to stage 2 here, on its existing access_token link: stage2_invited_at is written — the clock the reminder
 *         cron and the 14-day consent window run from — and the party is sent co_applicant_invited, the email its
 *         reminders resend verbatim (P1-R5). A re-shortlist keeps the first invite time. The link is kept alive for
 *         the window. Juristic sureties keep the director path. The lead's invite is unchanged.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { revalidatePath } from "next/cache"
import { addDays } from "date-fns"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited, sendShortlistInvitation as sendShortlistEmail } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"
import { inviteRoute } from "@/lib/applications/juristicParties"

/** The stage-2 consent window (14W): a party invited at shortlist has this long to consent before its line declines. */
const STAGE2_WINDOW_DAYS = 14

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
    .select("id, applicant_email, first_name, org_id, listing_id, entity_type, applicant_type, company_info")
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
        isJoint: ctx.isJoint,
      })
    }
  } catch (e) { console.error("sendShortlistEmail failed:", e) }

  await inviteCoPartiesToStage2(db, orgId, application)

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
  await recordAudit(db, { orgId: orgId, table: "applications", recordId: applicationId, action: "UPDATE", actorId: userId, after: { stage1_status: "shortlisted", stage2_status: "invited" } })

  revalidatePath("/listings")
  return { success: true }
}

type Db = Awaited<ReturnType<typeof requireAgentWriteAccess>>["db"]

/**
 * P1-R8b-2: invite every live residential co row to stage 2. The write is the anchor and goes first; the email is
 * best-effort, as every invite here is. Rows that have already consented are stamped (the clock is harmless) but
 * not emailed.
 */
async function inviteCoPartiesToStage2(
  db: Db, orgId: string,
  application: Readonly<{ id: string; entity_type: unknown; applicant_type: unknown; company_info: unknown }>,
): Promise<void> {
  const applicationId = application.id
  const { data: parties, error } = await db
    .from("application_co_applicants")
    .select("id, first_name, applicant_email, access_token, access_token_expires, stage2_invited_at, stage2_consent_given_at, role, is_surety_director, declared_director")
    .eq("org_id", orgId)
    .eq("primary_application_id", applicationId)
    .is("declined_at", null)
  if (error) {
    logQueryError("sendShortlistInvitation application_co_applicants", error)
    return
  }
  // Only a party whose invite is the joint-rental one — inviteRoute, the predicate every other sender reads — is
  // invited here. A juristic surety keeps the director path and a held one is sent nothing (walker F2, 72-p1-r8:
  // the pricing reading `isJuristicApplication` is false for every application today, so it cannot route copy).
  const residential = (parties ?? []).filter((p) => inviteRoute({ party: p, application }) === "co_applicant")
  if (residential.length === 0) return

  const now = new Date()
  const windowEnd = addDays(now, STAGE2_WINDOW_DAYS)
  for (const party of residential) {
    if (party.stage2_invited_at) continue
    // The link must outlive the window it is the only way through (the column default is 30 days from creation).
    const expires = party.access_token_expires ? new Date(party.access_token_expires as string) : null
    const { error: stampErr } = await db
      .from("application_co_applicants")
      .update({
        stage2_invited_at: now.toISOString(),
        ...(expires && expires < windowEnd ? { access_token_expires: windowEnd.toISOString() } : {}),
      })
      .eq("id", party.id as string)
      .eq("org_id", orgId)
      .is("stage2_invited_at", null)
    logQueryError("sendShortlistInvitation stage2_invited_at", stampErr)
  }

  const toEmail = residential.filter((p) => !p.stage2_invited_at && !p.stage2_consent_given_at && p.applicant_email && p.access_token)
  if (toEmail.length === 0) return
  try {
    const ctx = await buildEmailContext(applicationId)
    if (!ctx) return
    const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
    for (const party of toEmail) {
      void sendCoApplicantInvited(
        { firstName: (party.first_name as string | null) ?? "", email: party.applicant_email as string },
        ctx.listingSummary,
        ctx.orgContext,
        {
          accessToken: party.access_token as string,
          primaryApplicantName: primaryName,
          resend: { coApplicantId: party.id as string, triggerEventType: "shortlist:stage2_invite", triggerEventId: applicationId },
        },
      )
    }
  } catch (e) { console.error("stage-2 co invite failed:", e) }
}
