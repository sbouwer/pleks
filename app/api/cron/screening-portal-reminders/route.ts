/**
 * app/api/cron/screening-portal-reminders/route.ts — Daily reminder cron for commercial portal completion
 *
 * Route:  GET /api/cron/screening-portal-reminders
 * Auth:   x-cron-secret header
 * Notes:  Called from /api/cron/daily orchestrator. Processes T+3 / T+7 / T+10 milestones and the T+14 deadline
 *         for co-party lines, routed by the view's `party_kind` (BUILD_72 P1-R1 commit 3). ONE CLOCK (14W §0b):
 *         every party's window runs SCREENING_WINDOW_DAYS from its own `stage2_invited_at`, written at shortlist for
 *         every party, sureties included; an uninvited party is skipped. At the deadline every unfinished party is
 *         declined by one writer (`declineLine`) — whoever completed counts — and the FitScore orchestrator is
 *         offered the application. Nothing here refunds: a paid line is never declined (§0).
 *         · surety whose inviteRoute is "surety" → the role-neutral surety reminder + director-portal link; primary
 *           contact notified at T+7 and T+10 (informational only); expiry notice at the deadline.
 *         · a surety inviteHold still holds (none today: no approved role sentence fits it) → HELD: no send, no expiry.
 *         · co_applicant, or guarantor (a surety on a NON-juristic application, P1-R3a) →
 *           `co_applicant_invited` resent verbatim at each milestone (P1-R5); no notice at the deadline.
 *         · consented, unpaid → no reminder (no approved pay prompt exists), declined at the deadline like anyone.
 *         · anything else (null/unknown party_kind) → skipped. No email beats a wrong one.
 *         Milestone tracking: reminder_milestones_sent jsonb on application_co_applicants prevents
 *         re-sending if the daily cron misses a run — each key (t3/t7/t10) is marked once sent.
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { buildDirectorReminderElement } from "@/lib/applications/commercial-emails"
import { buildEmailContext } from "@/lib/applications/buildEmailContext"
import { sendCoApplicantInvited } from "@/lib/applications/emails"
import { inviteRoute } from "@/lib/applications/juristicParties"
import { maybeFireAllGreen } from "@/lib/applications/peerCompletion"
import { maybeRunOrchestrator } from "@/lib/screening/maybeRunOrchestrator"
import { readLine } from "@/lib/screening/lineFee"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import { recordAudit } from "@/lib/audit/recordAudit"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"
const DAY_MS = 86_400_000
/** The stage-2 consent window (14W), from stage2_invited_at — THE screening window. */
const STAGE2_WINDOW_MS = SCREENING_WINDOW_DAYS * DAY_MS

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
      .in("state", ["pending_both", "paid_pending_consent", "consented_pending_payment", "expired_no_consent"])
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
  reminder_milestones_sent: Record<string, boolean> | null
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

function dueStage(daysElapsed: number, sent: Record<string, boolean>): "t3" | "t7" | "t10" | null {
  if (daysElapsed >= 10 && !sent.t10) return "t10"
  if (daysElapsed >= 7  && !sent.t7)  return "t7"
  if (daysElapsed >= 3  && !sent.t3)  return "t3"
  return null
}

async function processLine(service: Svc, line: PendingLine): Promise<LineOutcome> {
  const { data: coApp, error: coErr } = await service
    .from("application_co_applicants")
    .select("applicant_email, first_name, created_at, stage2_invited_at, primary_application_id, access_token, reminder_milestones_sent, role, is_surety_director, declared_director")
    .eq("id", line.subject_id)
    .is("declined_at", null)
    .single()

  if (coErr || !coApp) return "skipped"
  const row = coApp as CoAppRow & { is_surety_director: boolean | null; declared_director: boolean | null }
  const sent = (row.reminder_milestones_sent ?? {}) as Record<string, boolean>

  if (line.party_kind !== "co_applicant" && line.party_kind !== "guarantor" && line.party_kind !== "surety") return "skipped"

  // ONE CLOCK (14W §0b, §9 rows 26/40): every party's window runs SCREENING_WINDOW_DAYS from its own stage-2 invite,
  // written at shortlist — sureties included, since they are invited there now. Never `created_at`, never the payment
  // row's expires_at (a settlement field). A party nobody has invited is not chased, or expired, for it.
  if (!row.stage2_invited_at) return "skipped"
  const invitedAt = new Date(row.stage2_invited_at).getTime()
  const daysElapsed = Math.floor((Date.now() - invitedAt) / DAY_MS)
  const pastDeadline = Date.now() >= invitedAt + STAGE2_WINDOW_MS

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

  if (line.party_kind === "surety") {
    const stage = dueStage(daysElapsed, sent)
    if (!stage) return "skipped"
    return sendMilestoneReminder(service, line, row, stage, daysElapsed, sent)
  }
  return processCoApplicantLine(service, line, row, daysElapsed, sent)
}

/** Residential joint co-applicant or guarantor (P1-R5). The reminder is the invite, verbatim; no new copy. */
async function processCoApplicantLine(
  service: Svc, line: PendingLine, coApp: CoAppRow, daysElapsed: number, sent: Record<string, boolean>,
): Promise<LineOutcome> {
  const stage = dueStage(daysElapsed, sent)
  if (!stage) return "skipped"
  const ctx = await buildEmailContext(line.application_id)
  if (!ctx) return "skipped"
  const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
  // sendEmail reports failure by RETURN, not by throwing (walker F4). Throw instead: the per-line catch reports it
  // to Sentry, and the milestone stays unstamped so the next run retries it rather than skipping it for good.
  const sendResult = await sendCoApplicantInvited(
    { firstName: coApp.first_name ?? "", email: coApp.applicant_email },
    ctx.listingSummary, ctx.orgContext,
    { accessToken: coApp.access_token, primaryApplicantName: primaryName,
      resend: { coApplicantId: line.subject_id, triggerEventType: "cron:screening_portal_reminders", triggerEventId: line.application_id } },
  )
  if (!sendResult.success) throw new Error(`co-applicant reminder ${stage} not sent: ${sendResult.error ?? "unknown"}`)
  await stampMilestone(service, line, sent, stage)
  return "reminded"
}

/** Records a milestone as sent. Called only after a send that reported success (walker F4). */
async function stampMilestone(service: Svc, line: PendingLine, sent: Record<string, boolean>, stage: "t3" | "t7" | "t10"): Promise<void> {
  const { error } = await service
    .from("application_co_applicants")
    .update({ reminder_milestones_sent: { ...sent, [stage]: true } })
    .eq("id", line.subject_id)
    .eq("org_id", line.org_id)
  if (error) throw new Error(`stamp reminder milestone ${stage}: ${error.message}`)
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
  stage: "t3" | "t7" | "t10",
  daysElapsed: number,
  sent: Record<string, boolean>,
): Promise<LineOutcome> {
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

  const sendResult = await sendEmail({
    orgId: line.org_id,
    templateKey: `application.director_reminder_${stage}`,
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

  if (!sendResult.success) throw new Error(`director reminder ${stage} not sent: ${sendResult.error ?? "unknown"}`)
  await stampMilestone(service, line, sent, stage)

  if (stage === "t7" || stage === "t10") {
    await notifyPrimaryContact(service, line, { primaryContactName, propertyLabel, directorName: line.subject_name, stage })
  }

  return "reminded"
}

async function notifyPrimaryContact(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  line: PendingLine,
  ctx: { primaryContactName: string; propertyLabel: string; directorName: string; stage: "t7" | "t10" },
): Promise<void> {
  const { data: app, error: appError } = await service
    .from("applications")
    .select("applicant_email")
    .eq("id", line.application_id)
    .single()
    logQueryError("notifyPrimaryContact applications", appError)

  if (!app?.applicant_email) return

  const urgency = ctx.stage === "t10" ? "Final reminder: " : ""
  // A FRAGMENT — sendEmail wraps it in the central EmailLayout and injects the org's branding. This used
  // to hand-roll a bare <!DOCTYPE> document, so the email went to applicants unbranded.
  const html = `
<p>Hi ${ctx.primaryContactName},</p>
<p>${urgency}<strong>${ctx.directorName}</strong> has not yet completed their portion of the application for <strong>${ctx.propertyLabel}</strong>.</p>
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
