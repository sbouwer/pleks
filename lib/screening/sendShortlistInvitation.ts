"use server"

/**
 * lib/screening/sendShortlistInvitation.ts — shortlist a stage-1 application and send the stage-2 invite
 *
 * Route:  server action, invoked from ApplicationActions.tsx (the detail page's "Invite to Credit Check")
 * Auth:   requireAgentWriteAccess("send_manual_comm") — this is a "use server" export (directly POSTable),
 *         so it MUST assert its own gate. The acting agent + org come from the authenticated session; the
 *         application is org-scoped to that session, so a cross-org applicationId resolves to "not found".
 * Data:   applications / application_tokens / application_co_applicants / communication_log / audit_log /
 *         screening_notification_events (service db, org-scoped).
 * Notes:  previously took a caller-supplied agentId and did NO auth at all — a zero-auth cross-org
 *         shortlist/invite with a forgeable prescreened_by. Never trust a caller-supplied identity here.
 *         Invitable = canInviteToStage2: stage 1 complete OR ticked in triage (shortlistStage1Action), no stage 2
 *         yet — the same predicate the button reads (CD 2026-10-02).
 *         EVERY SEND IS AWAITED, AND NOTHING IS MARKED INVITED UNTIL ALL OF THEM SUCCEEDED (CD 2026-10-02). sendEmail
 *         reports failure by return, so a `void` send recorded "invited" for an email that never left. A failed send is
 *         the action's error and every status stays as it was; the agent retries. Co parties are sent first and the
 *         lead last, so a co failure never leaves the lead holding a live invite link on an uninvited application.
 *         BUILD_72 P1-R8b-2 + 14W §0b: shortlist is the invitation to EVERY party at once. Each live co row is invited
 *         to stage 2 on its existing access_token link, on the invite inviteRoute names — co_applicant_invited for a
 *         joint co-applicant or residential guarantor (the email its reminders resend verbatim, P1-R5),
 *         director_invited for a juristic surety — and stamped stage2_invited_at, the one clock the reminder cron and
 *         the window run from. The lead gets the same T0 on applications.stage2_invited_at. A re-shortlist keeps the
 *         first invite time. The link is kept alive for the window. A held surety is sent nothing.
 *         ADDENDUM_14X: every invite is N1 on the trail — one row per ATTEMPT, written before its outcome is acted on,
 *         so a failed invite's row stays even though nothing is marked invited. T0 is fixed once, before the sends,
 *         so the D each N1 row records is the D the stamped clock produces. A trail row that cannot be written stops
 *         the shortlist like a failed send: an invite with no evidence of it is not a completed invite. A party added
 *         AFTER the shortlist gets its N1 from the co-applicant add route, the only other place a window starts.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { addDays } from "date-fns"
import { enqueueScreening, fireScreening, isStrippedApplication } from "@/lib/applications/screeningJobs"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited, sendShortlistInvitation as sendShortlistEmail } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"
import { inviteRoute, suretyInviteRole } from "@/lib/applications/juristicParties"
import { sendDirectorInvite } from "@/lib/applications/directorInvite"
import { canInviteToStage2 } from "@/lib/applications/stage2Invite"
import { onlyLiveCoParties } from "@/lib/applications/liveCoParties"
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"
import type { SendEmailResult } from "@/lib/comms/send-email"
import { deadlineAsStated } from "@/lib/screening/notificationSchedule"
import { leadSubject, recordTrail, type TrailSubject } from "@/lib/screening/notificationTrail"

/** The stage-2 consent window (14W) and the lead's payment link both run SCREENING_WINDOW_DAYS — one window. */

const NOT_SENT = { error: "Could not send the invitation" }
const NOT_RECORDED = { error: "The invitation was sent but its status could not be recorded" }

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
    .select("id, applicant_email, first_name, org_id, listing_id, entity_type, applicant_type, company_info, stage1_status, stage2_status, pii_purged_at, deleted_at")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .single()
    logQueryError("sendShortlistInvitation applications", applicationError)

  if (!application) return { error: "Application not found" }
  // Before any send: an erased lead would get a fresh payment link minted and an email addressed to "[erased]",
  // and enqueueScreening's refusal comes only after both (DSAR follow-up 2).
  if (isStrippedApplication(application)) return { error: "This applicant's personal information has been erased" }
  if (application.deleted_at !== null) return { error: "Application not found" } // enqueueScreening refuses it too (walker F4)
  if (!canInviteToStage2(application.stage1_status as string | null, application.stage2_status as string | null)) {
    return { error: "This application cannot be invited to screening" }
  }

  const ctx = await buildEmailContext(applicationId)
  if (!ctx) return NOT_SENT

  // T0, fixed BEFORE the sends: N1 states the deadline D, so D and the clock must come from one instant (14X §2).
  const invitedAt = new Date()
  const n1: N1 = { orgId, applicationId, deadline: deadlineAsStated(invitedAt.toISOString()) }

  // Co parties first (see header): sent, not yet stamped.
  const co = await sendCoPartyInvites(db, application, ctx, n1)
  if (!co.ok) return co.error

  // The lead's payment link: available for the whole screening window. It was 7 days while the parties it waits on
  // had 14 to consent, so a lead could lose the means to pay for a set the window still held open.
  const { data: inviteToken, error: inviteTokenError } = await db
    .from("application_tokens")
    .insert({
      application_id: applicationId,
      token_type: "shortlist_invite",
      applicant_email: application.applicant_email,
      expires_at: addDays(new Date(), SCREENING_WINDOW_DAYS).toISOString(),
    })
    .select("token")
    .single()
    logQueryError("sendShortlistInvitation application_tokens", inviteTokenError)

  if (!inviteToken) return { error: "Failed to create invite token" }

  // Email 4: Shortlist invitation. Its success is what makes the application "invited".
  const leadSent = await sendShortlistEmail(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {
    inviteToken: inviteToken.token,
  })
  // The row is written first; the send's outcome decides the message, so a failed send is never reported as sent
  // because its row also failed (walker 14x F7).
  const leadRecorded = await trailN1(db, n1, leadSubject(application), "application.shortlisted", leadSent)
  if (!leadSent.success) {
    console.error("sendShortlistEmail failed:", leadSent.error)
    return NOT_SENT
  }
  if (!leadRecorded) return NOT_RECORDED

  // Every send succeeded — only now is anything marked invited. stage2_invited_at is the LEAD's T0 (14W §0b): the
  // same clock every co party's stage2_invited_at is, so one deadline holds for the whole shortlist.
  const { error: statusError } = await db.from("applications").update({
    stage1_status: "shortlisted",
    stage2_status: "invited",
    stage2_invited_at: invitedAt.toISOString(),
    fee_status: "pending",
    prescreened_by: userId,
    prescreened_at: invitedAt.toISOString(),
  }).eq("id", applicationId).eq("org_id", orgId)
  if (statusError) {
    logQueryError("sendShortlistInvitation status", statusError)
    return NOT_RECORDED
  }
  if (!(await stampStage2Invited(db, orgId, co.toStamp, invitedAt))) return NOT_RECORDED

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

  // A18 — this is a shortlist too, so it enqueues the 14M deep scan exactly as shortlistStage1Action does
  // (verify-14m row 39): only when there is no evaluation yet or the documents changed after the latest one.
  const queued = await enqueueScreening(db, { orgId, applicationId })
  if (queued === "queued") after(() => fireScreening(db, { applicationId }))

  revalidatePath("/listings")
  return { success: true }
}

type Db = Awaited<ReturnType<typeof requireAgentWriteAccess>>["db"]
type EmailCtx = NonNullable<Awaited<ReturnType<typeof buildEmailContext>>>
type CoRow = { id: string; access_token_expires: string | null }
/** What every N1 trail row of one shortlist shares: the application and the D its invites state. */
type N1 = { orgId: string; applicationId: string; deadline: string }

/** N1 on the trail (14X §3) — one row per attempt, sent or failed. False = the row could not be written. */
async function trailN1(db: Db, n1: N1, subject: TrailSubject, templateKey: string, sent: SendEmailResult | null): Promise<boolean> {
  try {
    await recordTrail(db, { orgId: n1.orgId, applicationId: n1.applicationId, subject, milestone: "N1", templateKey, deadlineAsStated: n1.deadline, sent })
    return true
  } catch (e) {
    console.error("sendShortlistInvitation trail:", e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * P1-R8b-2 + 14W §0b, send half: email every co party not yet invited and not yet consented. Returns the rows to
 * stamp — every not-yet-invited, not-held party, emailed or not (a consented one gets the clock, not an email) —
 * or `ok: false` with the agent's message if any send failed (NOT_SENT) or its trail row could not be written
 * (NOT_RECORDED — the email did go out), in which case the caller stamps nothing.
 */
async function sendCoPartyInvites(
  db: Db,
  application: Readonly<{ id: string; entity_type: unknown; applicant_type: unknown; company_info: unknown }>,
  ctx: EmailCtx, n1: N1,
): Promise<{ ok: true; toStamp: CoRow[] } | { ok: false; error: { error: string } }> {
  const applicationId = application.id
  const orgId = n1.orgId
  // An erased co is out of the set: never stamped invited (dsar-next walker F3).
  const { data: parties, error } = await onlyLiveCoParties(db
    .from("application_co_applicants")
    .select("id, first_name, applicant_email, access_token, access_token_expires, stage2_invited_at, stage2_consent_given_at, role, is_surety_director, declared_director")
    .eq("org_id", orgId)
    .eq("primary_application_id", applicationId))
  if (error) {
    logQueryError("sendShortlistInvitation application_co_applicants", error)
    return { ok: false, error: NOT_SENT }
  }
  // Every party is invited here, on the invite inviteRoute names — the predicate every other sender reads: the
  // joint-rental invite for a co-applicant or residential guarantor, the surety invite (with its approved role
  // sentence) for a juristic surety (14W §0b, §9 row 40 — sureties used to be emailed at declaration on a creation
  // clock). A HELD surety (no role sentence fits; none today) is sent nothing and its window does not start.
  const pending = (parties ?? []).filter((p) => !p.stage2_invited_at && inviteRoute({ party: p, application }) !== "held")

  const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
  for (const party of pending.filter((p) => !p.stage2_consent_given_at && p.applicant_email && p.access_token)) {
    const attempt = await sendStage2Invite(orgId, application, party, ctx, primaryName)
    if (!attempt) continue // held by its role sentence: nothing sent, nothing to record
    const subject: TrailSubject = { subjectType: "co_applicant", subjectId: party.id as string }
    const recorded = await trailN1(db, n1, subject, attempt.templateKey, attempt.sent)
    if (!attempt.sent?.success) return { ok: false, error: NOT_SENT }
    if (!recorded) return { ok: false, error: NOT_RECORDED }
  }
  return { ok: true, toStamp: pending.map((p) => ({ id: p.id as string, access_token_expires: p.access_token_expires as string | null })) }
}

type InviteParty = { id: unknown; first_name: unknown; applicant_email: unknown; access_token: unknown; role: unknown; is_surety_director: unknown; declared_director: unknown }

/**
 * One party's stage-2 invite, on the route inviteRoute names: the key it went out on and the send's result (null when
 * the surety sender could not read the application — a failed attempt). Null overall = held, nothing attempted.
 */
async function sendStage2Invite(
  orgId: string,
  application: Readonly<{ id: string; entity_type: unknown; applicant_type: unknown; company_info: unknown }>,
  party: InviteParty, ctx: EmailCtx, primaryName: string,
): Promise<{ templateKey: string; sent: SendEmailResult | null } | null> {
  const invitee = { party: party as Parameters<typeof inviteRoute>[0]["party"], application }
  if (inviteRoute(invitee) === "surety") {
    const role = suretyInviteRole(invitee)
    if (!role) return null // held by its role sentence — sent nothing, and the caller's filter already excludes it
    const sent = await sendDirectorInvite({
      orgId, applicationId: application.id, coApplicantId: party.id as string, token: party.access_token as string,
      directorEmail: party.applicant_email as string, directorFirstName: (party.first_name as string | null) || "there", role,
    })
    if (!sent?.success) console.error("stage-2 surety invite failed:", sent?.error ?? "application unreadable")
    return { templateKey: "application.director_invited", sent }
  }
  const sent = await sendCoApplicantInvited(
    { firstName: (party.first_name as string | null) ?? "", email: party.applicant_email as string },
    ctx.listingSummary,
    ctx.orgContext,
    {
      accessToken: party.access_token as string,
      primaryApplicantName: primaryName,
      resend: { coApplicantId: party.id as string, triggerEventType: "shortlist:stage2_invite", triggerEventId: application.id },
    },
  )
  if (!sent.success) console.error("stage-2 co invite failed:", sent.error)
  return { templateKey: "application.co_applicant_invited", sent }
}

/** P1-R8b-2, write half: start each party's window at the shortlist's one T0. Runs only after every send succeeded. */
async function stampStage2Invited(db: Db, orgId: string, rows: CoRow[], now: Date): Promise<boolean> {
  const windowEnd = addDays(now, SCREENING_WINDOW_DAYS)
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
