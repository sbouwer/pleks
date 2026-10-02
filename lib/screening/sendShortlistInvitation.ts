"use server"

/**
 * lib/screening/sendShortlistInvitation.ts — shortlist a stage-1 application and send the stage-2 invite
 *
 * Route:  server action, invoked from ApplicationActions.tsx (the detail page's "Invite to Credit Check")
 * Auth:   requireAgentWriteAccess("send_manual_comm") — this is a "use server" export (directly POSTable),
 *         so it MUST assert its own gate. The acting agent + org come from the authenticated session; the
 *         application is org-scoped to that session, so a cross-org applicationId resolves to "not found".
 * Data:   applications / application_tokens / application_co_applicants / communication_log / audit_log
 *         (service db, org-scoped).
 * Notes:  previously took a caller-supplied agentId and did NO auth at all — a zero-auth cross-org
 *         shortlist/invite with a forgeable prescreened_by. Never trust a caller-supplied identity here.
 *         Invitable = canInviteToStage2: stage 1 complete OR ticked in triage (shortlistStage1Action), no stage 2
 *         yet — the same predicate the button reads (CD 2026-10-02).
 *         EVERY SEND IS AWAITED, AND NOTHING IS MARKED INVITED UNTIL ALL OF THEM SUCCEEDED (CD 2026-10-02). sendEmail
 *         reports failure by return, so a `void` send recorded "invited" for an email that never left. A failed send is
 *         the action's error and every status stays as it was; the agent retries. Co parties are sent first and the
 *         lead last, so a co failure never leaves the lead holding a live invite link on an uninvited application.
 *         BUILD_72 P1-R8b-2: every live co row whose inviteRoute is "co_applicant" (a joint co-applicant or a
 *         residential guarantor) is invited to stage 2 on its existing access_token link: stage2_invited_at — the
 *         clock the reminder cron and the 14-day consent window run from — and the party is sent co_applicant_invited,
 *         the email its reminders resend verbatim (P1-R5). A re-shortlist keeps the first invite time. The link is
 *         kept alive for the window. Juristic sureties keep the director path; a held one is sent nothing.
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
import { canInviteToStage2 } from "@/lib/applications/stage2Invite"

/** The stage-2 consent window (14W): a party invited at shortlist has this long to consent before its line declines. */
const STAGE2_WINDOW_DAYS = 14

const NOT_SENT = { error: "Could not send the invitation" }

/** Declared, not inferred: with a shared `NOT_SENT` constant the inferred union has no `error` on its success arm. */
type ShortlistResult = { success: true; error?: undefined } | { error: string; success?: undefined }

export async function sendShortlistInvitation(applicationId: string): Promise<ShortlistResult> {
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
    .select("id, applicant_email, first_name, org_id, listing_id, entity_type, applicant_type, company_info, stage1_status, stage2_status")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .single()
    logQueryError("sendShortlistInvitation applications", applicationError)

  if (!application) return { error: "Application not found" }
  if (!canInviteToStage2(application.stage1_status as string | null, application.stage2_status as string | null)) {
    return { error: "This application cannot be invited to screening" }
  }

  const ctx = await buildEmailContext(applicationId)
  if (!ctx) return NOT_SENT

  // Co parties first (see header): sent, not yet stamped.
  const co = await sendCoPartyInvites(db, orgId, application, ctx)
  if (!co.ok) return NOT_SENT

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

  // Email 4: Shortlist invitation. Its success is what makes the application "invited".
  const leadSent = await sendShortlistEmail(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {
    inviteToken: inviteToken.token,
    isJoint: ctx.isJoint,
  })
  if (!leadSent.success) {
    console.error("sendShortlistEmail failed:", leadSent.error)
    return NOT_SENT
  }

  // Every send succeeded — only now is anything marked invited.
  const { error: statusError } = await db.from("applications").update({
    stage1_status: "shortlisted",
    stage2_status: "invited",
    fee_status: "pending",
    prescreened_by: userId,
    prescreened_at: new Date().toISOString(),
  }).eq("id", applicationId).eq("org_id", orgId)
  if (statusError) {
    logQueryError("sendShortlistInvitation status", statusError)
    return { error: "The invitation was sent but its status could not be recorded" }
  }
  if (!(await stampStage2Invited(db, orgId, co.toStamp))) {
    return { error: "The invitation was sent but its status could not be recorded" }
  }

  // Log to communication_log
  const { error: commsError } = await db.from("communication_log").insert({
    org_id: orgId,
    channel: "email",
    direction: "outbound",
    subject: `Shortlist invitation sent to ${application.applicant_email}`,
    body: `Shortlisted for listing ${application.listing_id}`,
    status: "sent",
    sent_to_email: application.applicant_email,
  })
  logQueryError("sendShortlistInvitation communication_log", commsError)

  // Audit log
  await recordAudit(db, { orgId: orgId, table: "applications", recordId: applicationId, action: "UPDATE", actorId: userId, after: { stage1_status: "shortlisted", stage2_status: "invited" } })

  revalidatePath("/listings")
  return { success: true }
}

type Db = Awaited<ReturnType<typeof requireAgentWriteAccess>>["db"]
type EmailCtx = NonNullable<Awaited<ReturnType<typeof buildEmailContext>>>
type CoRow = { id: string; access_token_expires: string | null }

/**
 * P1-R8b-2, send half: email every residential co party not yet invited and not yet consented. Returns the rows to
 * stamp — every not-yet-invited residential party, emailed or not (a consented one gets the clock, not an email) —
 * or `ok: false` if any send failed, in which case the caller stamps nothing.
 */
async function sendCoPartyInvites(
  db: Db, orgId: string,
  application: Readonly<{ id: string; entity_type: unknown; applicant_type: unknown; company_info: unknown }>,
  ctx: EmailCtx,
): Promise<{ ok: true; toStamp: CoRow[] } | { ok: false }> {
  const applicationId = application.id
  const { data: parties, error } = await db
    .from("application_co_applicants")
    .select("id, first_name, applicant_email, access_token, access_token_expires, stage2_invited_at, stage2_consent_given_at, role, is_surety_director, declared_director")
    .eq("org_id", orgId)
    .eq("primary_application_id", applicationId)
    .is("declined_at", null)
  if (error) {
    logQueryError("sendShortlistInvitation application_co_applicants", error)
    return { ok: false }
  }
  // Only a party whose invite is the joint-rental one — inviteRoute, the predicate every other sender reads — is
  // invited here. A juristic surety keeps the director path and a held one is sent nothing (walker F2, 72-p1-r8:
  // the pricing reading `isJuristicApplication` is false for every application today, so it cannot route copy).
  const pending = (parties ?? []).filter((p) => inviteRoute({ party: p, application }) === "co_applicant" && !p.stage2_invited_at)

  const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
  for (const party of pending.filter((p) => !p.stage2_consent_given_at && p.applicant_email && p.access_token)) {
    const sent = await sendCoApplicantInvited(
      { firstName: (party.first_name as string | null) ?? "", email: party.applicant_email as string },
      ctx.listingSummary,
      ctx.orgContext,
      {
        accessToken: party.access_token as string,
        primaryApplicantName: primaryName,
        resend: { coApplicantId: party.id as string, triggerEventType: "shortlist:stage2_invite", triggerEventId: applicationId },
      },
    )
    if (!sent.success) {
      console.error("stage-2 co invite failed:", sent.error)
      return { ok: false }
    }
  }
  return { ok: true, toStamp: pending.map((p) => ({ id: p.id as string, access_token_expires: p.access_token_expires as string | null })) }
}

/** P1-R8b-2, write half: start each party's window. Runs only after every send succeeded. */
async function stampStage2Invited(db: Db, orgId: string, rows: CoRow[]): Promise<boolean> {
  const now = new Date()
  const windowEnd = addDays(now, STAGE2_WINDOW_DAYS)
  for (const party of rows) {
    // The link must outlive the window it is the only way through (the column default is 30 days from creation).
    const expires = party.access_token_expires ? new Date(party.access_token_expires) : null
    const { error } = await db
      .from("application_co_applicants")
      .update({
        stage2_invited_at: now.toISOString(),
        ...(expires && expires < windowEnd ? { access_token_expires: windowEnd.toISOString() } : {}),
      })
      .eq("id", party.id)
      .eq("org_id", orgId)
      .is("stage2_invited_at", null)
    if (error) {
      logQueryError("sendShortlistInvitation stage2_invited_at", error)
      return false
    }
  }
  return true
}
