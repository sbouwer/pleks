/**
 * app/api/cron/screening-portal-reminders/route.ts — daily 14X reminder schedule (N2/N4) for every party, plus the deadline
 *
 * Route:  GET /api/cron/screening-portal-reminders
 * Auth:   x-cron-secret header
 * Notes:  Called from /api/cron/daily orchestrator. ADDENDUM_14X §2: each party is reminded at N2 and N4, computed from
 *         its OWN stage-2 invite (lib/screening/notificationSchedule.ts — the offsets derive from SCREENING_WINDOW_DAYS),
 *         and every attempt, sent or failed, writes one row to the append-only trail (lib/screening/notificationTrail.ts).
 *         A milestone counts as sent only with a successful row, so a failed send is retried on the next run; only the
 *         latest due milestone is ever sent (a missed run sends the missed milestone, never two). The trail replaced the
 *         reminder_milestones_sent jsonb, which has no writer any more; until its DROP it is still READ (withLegacySent),
 *         so a party mid-window at deploy is not reminded twice.
 *         THE LEAD (14X §7, row 32): reminded at N2/N4 with the shortlist email resent verbatim on its live invite token —
 *         the 3-day nudge application-reminders used to send retired into this. Not declined here at the deadline: the
 *         lead's outcome at D is N6/N6′ (14X P4).
 *         CO PARTIES, routed by the view's `party_kind` (BUILD_72 P1-R1). ONE CLOCK (14W §0b): every party's window runs
 *         from its own `stage2_invited_at`, written at shortlist for every party, sureties included; an uninvited party is
 *         skipped. At the deadline every unfinished co party is declined by one writer (`declineLine`) — whoever completed
 *         counts — and the FitScore orchestrator is offered the application. Nothing here refunds (§0).
 *         · surety whose inviteRoute is "surety" → the role-neutral surety reminder (the t3 copy at N2, t7 at N4) +
 *           director-portal link; primary contact told at N4 (informational only); expiry notice at the deadline.
 *         · a surety inviteHold still holds (none today: no approved role sentence fits it) → HELD: no send, no expiry.
 *         · co_applicant, or guarantor (a surety on a NON-juristic application, P1-R3a) →
 *           `co_applicant_invited` resent verbatim at each milestone (P1-R5); no notice at the deadline.
 *         · consented, unpaid (lead or co) → no reminder (no approved pay prompt exists); a co is declined at the deadline.
 *         · anything else (null/unknown party_kind) → skipped. No email beats a wrong one.
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { buildDirectorReminderElement } from "@/lib/applications/commercial-emails"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited, sendShortlistInvitation } from "@/lib/applications/emails"
import { inviteRoute } from "@/lib/applications/juristicParties"
import { maybeFireAllGreen } from "@/lib/applications/peerCompletion"
import { maybeRunOrchestrator } from "@/lib/screening/maybeRunOrchestrator"
import { readLine } from "@/lib/screening/lineFee"
import {
  daysRemaining, deadlineAsStated, dueReminder, isPastDeadline, windowOpenSince, type ReminderMilestone,
} from "@/lib/screening/notificationSchedule"
import { leadSubject, milestonesSentOk, recordTrail, type TrailSubject } from "@/lib/screening/notificationTrail"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import { recordAudit } from "@/lib/audit/recordAudit"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"
const DAY_MS = 86_400_000
/** The states in which a party still owes something (the view's), and is therefore still on the schedule. */
const OWING = ["pending_both", "paid_pending_consent", "consented_pending_payment", "expired_no_consent"]
/** The surety reminder's approved copy is staged: the gentle t3 wording at N2, the t7 wording at N4. */
const SURETY_COPY: Record<ReminderMilestone, "t3" | "t7"> = { N2: "t3", N4: "t7" }

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const service = await createServiceClient()
  let reminders = 0
  let expirations = 0
  let held = 0

  try {
    // `expired_no_consent` is selected for the co_applicant branch only (P1-R6, and M-112's owner for it);
    // the director branch keeps the three states it always had.
    const { data: lines, error } = await service
      .from("v_application_screening_lines")
      .select("application_id, subject_id, subject_name, org_id, paid_at, expires_at, state, party_kind")
      .eq("subject_type", "co_applicant")
      .in("state", OWING)
      .limit(500)

    if (error) {
      console.error("[screening-portal-reminders] view query failed:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    for (const line of lines ?? []) {
      try {
        const result = await processLine(service, line)
        if (result === "reminded") reminders++
        if (result === "expired") expirations++
        if (result === "held") held++
      } catch (err) {
        Sentry.captureException(err, {
          tags: { cron_job: "screening_portal_reminders" },
          extra: { subject_id: line.subject_id },
        })
      }
    }

    // The leads: every application whose stage-2 invite is out and not yet acted on (14X §7 — the shortlist nudge
    // application-reminders sent retired into N2/N4 here).
    // Shortlisted, live, and still inside the window (walker 14x F1/F3): a lead declined after its invite (a withdrawn
    // listing declines every applicant) keeps stage2_status 'invited', and nothing moves a lead off it at D yet, so
    // without the stage-1 and window bounds the scan would remind the declined and fill its 500 with the expired.
    const { data: leads, error: leadsError } = await service
      .from("applications")
      .select("id, org_id, entity_type, stage2_invited_at, stage2_reminder_sent_at")
      .eq("stage2_status", "invited")
      .eq("stage1_status", "shortlisted")
      .is("deleted_at", null)
      .not("stage2_invited_at", "is", null)
      .gt("stage2_invited_at", windowOpenSince().toISOString())
      .order("stage2_invited_at", { ascending: true })
      .limit(500)
    if (leadsError) {
      console.error("[screening-portal-reminders] lead query failed:", leadsError.message)
      return NextResponse.json({ error: leadsError.message }, { status: 500 })
    }
    for (const lead of leads ?? []) {
      try {
        if ((await processLeadLine(service, lead as LeadApp)) === "reminded") reminders++
      } catch (err) {
        Sentry.captureException(err, {
          tags: { cron_job: "screening_portal_reminders" },
          extra: { application_id: lead.id },
        })
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { cron_job: "screening_portal_reminders" } })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reminders, expirations, held })
}

type PendingLine = {
  application_id: string
  subject_id: string
  subject_name: string
  org_id: string
  paid_at: string | null
  expires_at: string | null
  state: string
  party_kind: string | null
}

type LineOutcome = "reminded" | "expired" | "held" | "skipped"

type Svc = Awaited<ReturnType<typeof createServiceClient>>

type CoAppRow = {
  applicant_email: string
  first_name: string | null
  created_at: string
  stage2_invited_at: string | null
  primary_application_id: string
  access_token: string
}

type LeadApp = { id: string; org_id: string; entity_type: string | null; stage2_invited_at: string; stage2_reminder_sent_at: string | null }

/**
 * TRANSITIONAL (walker 14x F5): what the pre-trail stamps already sent, read as trail milestones so a party mid-window
 * at deploy is not sent its reminder twice — t3 was N2's day, t7 N4's (t10 sat past N4, so it counts as N4), and the
 * lead's retired 3-day nudge was its N2. Delete with the reminder_milestones_sent / stage2_reminder_sent_at DROP, one
 * window after deploy: by then every party on the schedule was invited under the trail.
 */
function withLegacySent(sentOk: Set<string>, legacy: { milestones?: unknown; leadNudgedAt?: string | null }): Set<string> {
  const m = (legacy.milestones ?? {}) as Record<string, unknown>
  const out = new Set(sentOk)
  if (m.t3) out.add("N2")
  if (m.t7 || m.t10) out.add("N4")
  if (legacy.leadNudgedAt) out.add("N2")
  return out
}

function resolveListingLabel(listings: unknown): { slug: string; propertyLabel: string } {
  const listing = listings as {
    public_slug: string
    units: { unit_number: string; properties: { name: string } }
  } | null
  return {
    slug: listing?.public_slug ?? "",
    // No listing → "the property"; a listing with a missing unit embed → "" (preserved from the prior inline join).
    propertyLabel: listing ? formatPropertyLabel(listing.units, { separator: " — ", fallback: "" }) : "the property",
  }
}

/** The lead's N2/N4: the shortlist email resent verbatim on the live invite token (the nudge it replaced did the same). */
async function processLeadLine(service: Svc, lead: LeadApp): Promise<LineOutcome> {
  const subject = leadSubject(lead)
  const { data: own, error: ownError } = await service
    .from("v_application_screening_lines")
    .select("state")
    .eq("org_id", lead.org_id)
    .eq("application_id", lead.id)
    .eq("subject_type", subject.subjectType)
    .eq("subject_id", subject.subjectId)
    .maybeSingle()
  if (ownError) throw new Error(`read lead line: ${ownError.message}`)
  // Consented-but-unpaid is not chased (no approved pay prompt, as for a co party); a lead with no owing line is done.
  if (!own || !OWING.includes(own.state as string) || own.state === "consented_pending_payment") return "skipped"

  const sentOk = withLegacySent(await milestonesSentOk(service, lead.org_id, lead.id, subject), { leadNudgedAt: lead.stage2_reminder_sent_at })
  const due = dueReminder(lead.stage2_invited_at, sentOk)
  if (!due) return "skipped"

  // Reuse the live shortlist token — minting one is the shortlist action's job. It lives the whole window, so its
  // absence inside the window is an anomaly worth a person's eye rather than a silent skip.
  const { data: tok, error: tokError } = await service
    .from("application_tokens")
    .select("token")
    .eq("application_id", lead.id)
    .eq("token_type", "shortlist_invite")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tokError) throw new Error(`read shortlist token: ${tokError.message}`)
  if (!tok) {
    Sentry.captureMessage("Lead reminder due but no live shortlist token", {
      level: "warning", tags: { cron_job: "screening_portal_reminders" }, extra: { application_id: lead.id, milestone: due },
    })
    return "skipped"
  }
  const ctx = await buildEmailContext(lead.id)
  if (!ctx) return "skipped"
  // The approved wording, with the days actually left: "expires in 14 days" on day 3 would promise a later deadline
  // than the one in force (walker 14x F2), as resendDirectorInvite already avoids.
  const sent = await sendShortlistInvitation(ctx.appSummary, ctx.listingSummary, ctx.orgContext, {
    inviteToken: tok.token as string, expiresInDays: daysRemaining(lead.stage2_invited_at),
  })
  await trail(service, lead.org_id, lead.id, subject, due, "application.shortlisted", lead.stage2_invited_at, sent)
  if (!sent.success) throw new Error(`lead reminder ${due} not sent: ${sent.error ?? "unknown"}`)
  return "reminded"
}

/** One trail row for one attempt (14X §3) — written before the outcome is acted on, so a failure row always stays. */
async function trail(
  service: Svc, orgId: string, applicationId: string, subject: TrailSubject, milestone: ReminderMilestone,
  templateKey: string, t0: string, sent: Awaited<ReturnType<typeof sendEmail>> | null,
): Promise<void> {
  await recordTrail(service, { orgId, applicationId, subject, milestone, templateKey, deadlineAsStated: deadlineAsStated(t0), sent })
}

async function processLine(service: Svc, line: PendingLine): Promise<LineOutcome> {
  const { data: coApp, error: coErr } = await service
    .from("application_co_applicants")
    .select("applicant_email, first_name, created_at, stage2_invited_at, primary_application_id, access_token, role, is_surety_director, declared_director, reminder_milestones_sent")
    .eq("id", line.subject_id)
    .is("declined_at", null)
    .single()

  if (coErr || !coApp) return "skipped"
  const row = coApp as CoAppRow & { is_surety_director: boolean | null; declared_director: boolean | null; reminder_milestones_sent: unknown }

  if (line.party_kind !== "co_applicant" && line.party_kind !== "guarantor" && line.party_kind !== "surety") return "skipped"

  // ONE CLOCK (14W §0b, §9 rows 26/40): every party's window runs SCREENING_WINDOW_DAYS from its own stage-2 invite,
  // written at shortlist — sureties included, since they are invited there now. Never `created_at`, never the payment
  // row's expires_at (a settlement field). A party nobody has invited is not chased, or expired, for it.
  if (!row.stage2_invited_at) return "skipped"
  const t0 = row.stage2_invited_at
  const pastDeadline = isPastDeadline(t0)

  // HELD (P1-R3): a surety no approved role sentence fits is not reminded, and not expired either — declining someone
  // for not completing an invite we withheld would record their failure for ours. Since the 2026-10-03 A/B/C release
  // that set is empty. The decision is inviteRoute's, the same one the first invite and the co-parties Resend read.
  if (line.party_kind === "surety") {
    const { data: application, error: applicationError } = await service
      .from("applications")
      .select("entity_type, applicant_type, company_info")
      .eq("id", line.application_id)
      .eq("org_id", line.org_id)
      .maybeSingle()
    if (applicationError) throw new Error(`read application for invite route: ${applicationError.message}`)
    if (!application || inviteRoute({ party: row, application }) !== "surety") return "held"
  }

  if (line.state === "paid_pending_consent") {
    // Paid without consent — a race the billing gate should make impossible. Never declined: the money has no ruled
    // outcome at the deadline (§0 refunds only a terminal failure), so it waits for a person, flagged once it is due.
    if (pastDeadline) {
      Sentry.captureMessage("Paid screening line without consent reached its deadline", {
        level: "error", tags: { cron_job: "screening_portal_reminders", reason: "paid_pending_consent_at_deadline" },
        extra: { application_id: line.application_id, subject_id: line.subject_id },
      })
      return "skipped"
    }
  }

  // At the deadline, whoever did not complete does not count (§0): consented-but-unpaid included — it is declined on
  // the same clock as everyone else (walker 14w-s0a F2), and the set it leaves may now be complete.
  if (pastDeadline) return declineLine(service, line, row)

  // Consented, own line unpaid: no reminder. Every approved reminder is consent copy ("No credit check runs at this
  // stage"; "until the required consent is completed"), false for this party, and no approved pay prompt exists. The
  // party's own link shows the pay step. A pay reminder needs copy first (14W §0b, Decided in build).
  if (line.state === "consented_pending_payment") return "skipped"

  const subject: TrailSubject = { subjectType: "co_applicant", subjectId: line.subject_id }
  const sentOk = withLegacySent(await milestonesSentOk(service, line.org_id, line.application_id, subject), { milestones: row.reminder_milestones_sent })
  const due = dueReminder(t0, sentOk)
  if (!due) return "skipped"
  if (line.party_kind === "surety") return sendMilestoneReminder(service, line, row, due, t0)
  return processCoApplicantLine(service, line, row, due, t0)
}

/** Residential joint co-applicant or guarantor (P1-R5). The reminder is the invite, verbatim; no new copy. */
async function processCoApplicantLine(
  service: Svc, line: PendingLine, coApp: CoAppRow, due: ReminderMilestone, t0: string,
): Promise<LineOutcome> {
  const ctx = await buildEmailContext(line.application_id)
  if (!ctx) return "skipped"
  const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
  // sendEmail reports failure by RETURN, not by throwing (walker F4). The attempt is recorded either way; then a
  // failure throws, the per-line catch reports it to Sentry, and with no send_ok row the next run retries it.
  const sendResult = await sendCoApplicantInvited(
    { firstName: coApp.first_name ?? "", email: coApp.applicant_email },
    ctx.listingSummary, ctx.orgContext,
    { accessToken: coApp.access_token, primaryApplicantName: primaryName,
      resend: { coApplicantId: line.subject_id, triggerEventType: "cron:screening_portal_reminders", triggerEventId: line.application_id } },
  )
  await trail(service, line.org_id, line.application_id, { subjectType: "co_applicant", subjectId: line.subject_id }, due,
    "application.co_applicant_invited", t0, sendResult)
  if (!sendResult.success) throw new Error(`co-applicant reminder ${due} not sent: ${sendResult.error ?? "unknown"}`)
  return "reminded"
}

/** THE deadline decline, for every party kind (14W §0b — the surety branch's own writer folded in). A declined line
 *  leaves the set: whoever completed counts. Never reached by a paid line (processLine refuses one), so nothing is
 *  refunded here — §0's only refund is a terminal run failure, which is not this cron's. The roster shrinks, so:
 *  (1) the stage-1 "ready to submit" fan-out may fire, and (2) the remaining subjects may now all be complete, so the
 *  FitScore orchestrator is offered the application — before §0b only a line FINISHING did that, so an application
 *  whose last open party was declined never ran. A surety is told its portion expired (the approved notice, without
 *  the refund note it carried under the pooled model); a co party is sent nothing, as before. */
async function declineLine(service: Svc, line: PendingLine, coApp: CoAppRow): Promise<LineOutcome> {
  // The state was read once at the start of the run; the party may have paid since (walker 14w-s0b F3). Re-read its own
  // line immediately before declining, and never decline a paid one. The residual window (an ITN landing between this
  // read and the update) is held by the ITN, which flags a payment on a declined line for a person.
  const fresh = await readLine(service, { orgId: line.org_id, applicationId: line.application_id, subjectType: "co_applicant", subjectId: line.subject_id })
  if (!fresh.ok) throw new Error("decline line: payment re-read failed")
  if (fresh.row?.paid_at) return "skipped"

  const now = new Date().toISOString()
  const { data: declined, error } = await service
    .from("application_co_applicants")
    .update({ declined_at: now, decline_reason: "expired_no_completion" })
    .eq("id", line.subject_id)
    .eq("org_id", line.org_id)
    .is("declined_at", null)
    .select("id")
  if (error) throw new Error(`decline line: ${error.message}`)
  // An overlapping run already declined it: no second audit row, notice or fan-out (walker F6).
  if (!declined?.length) return "skipped"
  await recordAudit(service, { orgId: line.org_id, table: "application_co_applicants", recordId: line.subject_id, action: "UPDATE", after: { declined_at: now, decline_reason: "expired_no_completion" } })
  // The notice first: the line has left the view, so nothing after this point is retried (walker F6).
  if (line.party_kind === "surety") await sendSuretyExpiry(service, line, coApp)
  await maybeFireAllGreen(service, line.application_id)
  await maybeRunOrchestrator(service, line.org_id, line.application_id)
  return "expired"
}

async function sendSuretyExpiry(service: Svc, line: PendingLine, coApp: CoAppRow): Promise<void> {
  const { data: app, error: appError } = await service
    .from("applications")
    .select("first_name, last_name, listings(public_slug, units(unit_number, properties(name)))")
    .eq("id", line.application_id)
    .eq("org_id", line.org_id)
    .maybeSingle()
  logQueryError("sendSuretyExpiry applications", appError)
  if (!app) return

  const { propertyLabel } = resolveListingLabel(app.listings)
  const primaryContactName = [app.first_name, app.last_name].filter(Boolean).join(" ") || "the applicant"
  const sendResult = await sendEmail({
    orgId: line.org_id,
    // The key keeps its registered name; the refund half of the notice retired with the pooled model (14W §0).
    templateKey: "application.director_expired_refund",
    to: { email: coApp.applicant_email, name: coApp.first_name ?? "" },
    subject: `Your application portion has expired — ${propertyLabel}`,
    contentHtml: buildExpiryHtml({ directorFirstName: coApp.first_name ?? "there", propertyLabel, primaryContactName }),
    entityType: "application_co_applicant", entityId: line.subject_id,
    triggerEventType: "cron:screening_portal_reminders", triggerEventId: line.application_id,
  })
  // The decline above stands either way; a failed notice is reported, not retried (the line has left the view).
  if (!sendResult.success) {
    Sentry.captureMessage("Surety expiry notice not sent", {
      level: "warning", tags: { cron_job: "screening_portal_reminders" },
      extra: { subject_id: line.subject_id, error: sendResult.error ?? "unknown" },
    })
  }
}

async function sendMilestoneReminder(
  service: Svc,
  line: PendingLine,
  coApp: CoAppRow,
  due: ReminderMilestone,
  t0: string,
): Promise<LineOutcome> {
  const stage = SURETY_COPY[due]
  const daysElapsed = Math.floor((Date.now() - new Date(t0).getTime()) / DAY_MS)
  const { data: app, error: appError } = await service
    .from("applications")
    .select("first_name, last_name, applicant_email, listings(public_slug, units(unit_number, properties(name)))")
    .eq("id", line.application_id)
    .single()
    logQueryError("sendMilestoneReminder applications", appError)

  if (!app) return "skipped"

  const { slug, propertyLabel } = resolveListingLabel(app.listings)
  const primaryContactName = [app.first_name, app.last_name].filter(Boolean).join(" ") || "the applicant"

  // No payer lookup: the "already paid for your portion" line is struck (counsel 2026-10-03 §2) — under 14W §0 every
  // party pays for their own line, so nobody has paid for a party whose portion is outstanding.
  const portalUrl = absoluteUrl(`/apply/${slug || line.application_id}/director-portal/${coApp.access_token}`)

  const branding = buildBranding(await fetchOrgSettings(line.org_id))

  const templateKey = `application.director_reminder_${stage}`
  const sendResult = await sendEmail({
    orgId: line.org_id,
    templateKey,
    to: { email: coApp.applicant_email, name: coApp.first_name ?? "" },
    subject: `Reminder: your portion is still outstanding — ${propertyLabel}`,
    emailElement: buildDirectorReminderElement({
      directorFirstName: coApp.first_name ?? "there",
      propertyLabel, portalUrl,
      daysRemaining: Math.max(0, SCREENING_WINDOW_DAYS - daysElapsed),
      stage,
      branding,
    }),
    entityType: "application_co_applicant", entityId: line.subject_id,
    triggerEventType: "cron:screening_portal_reminders", triggerEventId: line.application_id,
  })

  await trail(service, line.org_id, line.application_id, { subjectType: "co_applicant", subjectId: line.subject_id }, due,
    templateKey, t0, sendResult)
  if (!sendResult.success) throw new Error(`director reminder ${due} not sent: ${sendResult.error ?? "unknown"}`)

  // The lead is told at N4 only (it was told at t7 and t10; t10 retired with the 14X schedule).
  if (due === "N4") {
    await notifyPrimaryContact(service, line, { primaryContactName, propertyLabel, directorName: line.subject_name })
  }

  return "reminded"
}

async function notifyPrimaryContact(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  line: PendingLine,
  ctx: { primaryContactName: string; propertyLabel: string; directorName: string },
): Promise<void> {
  const { data: app, error: appError } = await service
    .from("applications")
    .select("applicant_email")
    .eq("id", line.application_id)
    .single()
    logQueryError("notifyPrimaryContact applications", appError)

  if (!app?.applicant_email) return

  // A FRAGMENT — sendEmail wraps it in the central EmailLayout and injects the org's branding. This used
  // to hand-roll a bare <!DOCTYPE> document, so the email went to applicants unbranded.
  const html = `
<p>Hi ${ctx.primaryContactName},</p>
<p><strong>${ctx.directorName}</strong> has not yet completed their portion of the application for <strong>${ctx.propertyLabel}</strong>.</p>
<p>If ${ctx.directorName} is unable to proceed, you can replace them from your application portal.</p>`

  await sendEmail({
    orgId: line.org_id,
    templateKey: "application.primary_contact_director_pending",
    to: { email: app.applicant_email as string, name: ctx.primaryContactName },
    subject: `Action needed: ${ctx.directorName} has not completed their portion`,
    contentHtml: html,
    entityType: "application",
    entityId: line.application_id,
    triggerEventType: "cron:screening_portal_reminders",
    triggerEventId: line.application_id,
  })
}

function buildExpiryHtml(p: { directorFirstName: string; propertyLabel: string; primaryContactName: string }): string {
  // A FRAGMENT — sendEmail wraps it in the central EmailLayout and injects the org's branding.
  return `
<p>Hi ${p.directorFirstName},</p>
<p>Your portion of the application for <strong>${p.propertyLabel}</strong> has expired as the ${SCREENING_WINDOW_DAYS}-day window has passed without completion.</p>
<p>The application has been notified to ${p.primaryContactName}. If you still want to participate, please ask them to add you again.</p>`
}
