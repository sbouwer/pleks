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
 *         BUILD_72 P1-R8b-2 + 14W §0b: shortlist is the invitation to EVERY party at once. Each live co row is invited
 *         to stage 2 on its existing access_token link, on the invite inviteRoute names — co_applicant_invited for a
 *         joint co-applicant or residential guarantor (the email its reminders resend verbatim, P1-R5),
 *         director_invited for a juristic surety — and stamped stage2_invited_at, the one clock the reminder cron and
 *         the window run from. The lead gets the same T0 on applications.stage2_invited_at. A re-shortlist keeps the
 *         first invite time. The link is kept alive for the window. A held surety is sent nothing.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { revalidatePath } from "next/cache"
import { addDays } from "date-fns"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited, sendShortlistInvitation as sendShortlistEmail } from "@/lib/applications/emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"
import { inviteRoute, suretyInviteRole } from "@/lib/applications/juristicParties"
import { sendDirectorInvite } from "@/lib/applications/directorInvite"
import { canInviteToStage2 } from "@/lib/applications/stage2Invite"
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"

/** The stage-2 consent window (14W) and the lead's payment link both run SCREENING_WINDOW_DAYS — one window. */

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
  if (!leadSent.success) {
    console.error("sendShortlistEmail failed:", leadSent.error)
    return NOT_SENT
  }

  // Every send succeeded — only now is anything marked invited. stage2_invited_at is the LEAD's T0 (14W §0b): the
  // same clock every co party's stage2_invited_at is, so one deadline holds for the whole shortlist.
  const invitedAt = new Date().toISOString()
  const { error: statusError } = await db.from("applications").update({
    stage1_status: "shortlisted",
    stage2_status: "invited",
    stage2_invited_at: invitedAt,
    fee_status: "pending",
    prescreened_by: userId,
    prescreened_at: invitedAt,
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
 * P1-R8b-2 + 14W §0b, send half: email every co party not yet invited and not yet consented. Returns the rows to
 * stamp — every not-yet-invited, not-held party, emailed or not (a consented one gets the clock, not an email) —
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
  // Every party is invited here, on the invite inviteRoute names — the predicate every other sender reads: the
  // joint-rental invite for a co-applicant or residential guarantor, the surety invite (with its approved role
  // sentence) for a juristic surety (14W §0b, §9 row 40 — sureties used to be emailed at declaration on a creation
  // clock). A HELD surety (no role sentence fits; none today) is sent nothing and its window does not start.
  const pending = (parties ?? []).filter((p) => !p.stage2_invited_at && inviteRoute({ party: p, application }) !== "held")

  const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
  for (const party of pending.filter((p) => !p.stage2_consent_given_at && p.applicant_email && p.access_token)) {
    if (!(await sendStage2Invite(orgId, application, party, ctx, primaryName))) return { ok: false }
  }
  return { ok: true, toStamp: pending.map((p) => ({ id: p.id as string, access_token_expires: p.access_token_expires as string | null })) }
}

type InviteParty = { id: unknown; first_name: unknown; applicant_email: unknown; access_token: unknown; role: unknown; is_surety_director: unknown; declared_director: unknown }

/** One party's stage-2 invite, on the route inviteRoute names. False = not sent; the caller stamps nothing. */
async function sendStage2Invite(
  orgId: string,
  application: Readonly<{ id: string; entity_type: unknown; applicant_type: unknown; company_info: unknown }>,
  party: InviteParty, ctx: EmailCtx, primaryName: string,
): Promise<boolean> {
  const invitee = { party: party as Parameters<typeof inviteRoute>[0]["party"], application }
  if (inviteRoute(invitee) === "surety") {
    const role = suretyInviteRole(invitee)
    if (!role) return true // held by its role sentence — sent nothing, and the caller's filter already excludes it
    const sent = await sendDirectorInvite({
      orgId, applicationId: application.id, coApplicantId: party.id as string, token: party.access_token as string,
      directorEmail: party.applicant_email as string, directorFirstName: (party.first_name as string | null) || "there", role,
    })
    if (!sent?.success) console.error("stage-2 surety invite failed:", sent?.error ?? "application unreadable")
    return !!sent?.success
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
  return sent.success
}

/** P1-R8b-2, write half: start each party's window. Runs only after every send succeeded. */
async function stampStage2Invited(db: Db, orgId: string, rows: CoRow[]): Promise<boolean> {
  const now = new Date()
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
