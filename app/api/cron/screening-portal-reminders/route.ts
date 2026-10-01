/**
 * app/api/cron/screening-portal-reminders/route.ts — Daily reminder cron for commercial portal completion
 *
 * Route:  GET /api/cron/screening-portal-reminders
 * Auth:   x-cron-secret header
 * Notes:  Called from /api/cron/daily orchestrator. Processes T+3 / T+7 / T+10 / T+14 milestones for
 *         co-applicant lines, routed by the view's `party_kind` (BUILD_72 P1-R1 commit 3):
 *         · surety + is_surety_director → director copy + director-portal link (the reviewed audience, P1-R3).
 *           T+14: line declined, payment flagged for manual refund (14C), expiry email sent; primary
 *           contact notified at T+7 and T+10 (informational only).
 *         · surety, NOT a declared director → HELD: no send, no expiry (P1-R3/R7 — no reviewed copy exists).
 *         · co_applicant → `co_applicant_invited` resent verbatim at each milestone (P1-R5); declined once
 *           unconsented past `expires_at` (P1-R6). The refund branch and any expiry notice are gated on
 *           Stéan, so neither is written here.
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
import { maybeFireAllGreen } from "@/lib/applications/peerCompletion"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import { recordAudit } from "@/lib/audit/recordAudit"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"
const DAY_MS = 86_400_000

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
    .select("applicant_email, first_name, created_at, primary_application_id, access_token, reminder_milestones_sent, role, is_surety_director")
    .eq("id", line.subject_id)
    .is("declined_at", null)
    .single()

  if (coErr || !coApp) return "skipped"
  const row = coApp as CoAppRow & { is_surety_director: boolean | null }
  const daysElapsed = Math.floor((Date.now() - new Date(row.created_at).getTime()) / DAY_MS)
  const sent = (row.reminder_milestones_sent ?? {}) as Record<string, boolean>

  if (line.party_kind === "co_applicant") return processCoApplicantLine(service, line, row, daysElapsed, sent)
  // Every branch below sends director copy, which is reviewed for a DIRECTOR audience only (P1-R3). The
  // view's state set for it is unchanged; `expired_no_consent` is the co_applicant branch's alone.
  if (line.party_kind !== "surety" || line.state === "expired_no_consent") return "skipped"
  // HELD (P1-R3): a surety who is not a declared director has no reviewed template. Not reminded, and not
  // expired either — declining someone for not completing an invite we withheld would record their failure
  // for ours. R7 adds the declaration; R3 makes the hold visible to the agent.
  if (row.is_surety_director !== true) return "held"

  if (daysElapsed >= 14) return expireDirectorLine(service, line, row)
  const stage = dueStage(daysElapsed, sent)
  if (!stage) return "skipped"
  return sendMilestoneReminder(service, line, row, stage, daysElapsed, sent)
}

/** Residential joint co-applicant (P1-R5/R6). The reminder is the invite, verbatim; no new copy. */
async function processCoApplicantLine(
  service: Svc, line: PendingLine, coApp: CoAppRow, daysElapsed: number, sent: Record<string, boolean>,
): Promise<LineOutcome> {
  // R6: the payment row's expires_at when there is one, else the same T+14 the director branch uses.
  const expiresAt = line.expires_at ? new Date(line.expires_at).getTime() : new Date(coApp.created_at).getTime() + 14 * DAY_MS
  if (Date.now() >= expiresAt) return declineCoApplicantLine(service, line)

  const stage = dueStage(daysElapsed, sent)
  if (!stage) return "skipped"
  const ctx = await buildEmailContext(line.application_id)
  if (!ctx) return "skipped"
  const primaryName = [ctx.appSummary.firstName, ctx.appSummary.lastName].filter(Boolean).join(" ")
  await sendCoApplicantInvited(
    { firstName: coApp.first_name ?? "", email: coApp.applicant_email },
    ctx.listingSummary, ctx.orgContext,
    { accessToken: coApp.access_token, primaryApplicantName: primaryName,
      resend: { coApplicantId: line.subject_id, triggerEventType: "cron:screening_portal_reminders", triggerEventId: line.application_id } },
  )
  await service
    .from("application_co_applicants")
    .update({ reminder_milestones_sent: { ...sent, [stage]: true } })
    .eq("id", line.subject_id)
    .eq("org_id", line.org_id)
  return "reminded"
}

/** R6 decline. The refund branch (joint-fee minus single-fee, or withdraw) is Stéan's and is NOT built:
 *  a paid line's payment row is left untouched, and no expiry notice is sent — that copy rides with the
 *  refund decision. The roster shrinks, so the remaining parties may now be all-green. */
async function declineCoApplicantLine(service: Svc, line: PendingLine): Promise<LineOutcome> {
  const now = new Date().toISOString()
  const { error } = await service
    .from("application_co_applicants")
    .update({ declined_at: now, decline_reason: "expired_no_completion" })
    .eq("id", line.subject_id)
    .eq("org_id", line.org_id)
  if (error) throw new Error(`decline co-applicant line: ${error.message}`)
  await recordAudit(service, { orgId: line.org_id, table: "application_co_applicants", recordId: line.subject_id, action: "UPDATE", after: { declined_at: now, decline_reason: "expired_no_completion" } })
  await maybeFireAllGreen(service, line.application_id)
  return "expired"
}

async function expireDirectorLine(service: Svc, line: PendingLine, coApp: CoAppRow): Promise<LineOutcome> {
  const { data: app, error: appError } = await service
    .from("applications")
    .select("first_name, last_name, applicant_email, listings(public_slug, units(unit_number, properties(name)))")
    .eq("id", line.application_id)
    .single()
    logQueryError("expireDirectorLine applications", appError)

  if (!app) return "skipped"

  const { propertyLabel } = resolveListingLabel(app.listings)
  const primaryContactName = [app.first_name, app.last_name].filter(Boolean).join(" ") || "the applicant"
  const now = new Date().toISOString()

  await service
    .from("application_co_applicants")
    .update({ declined_at: now, decline_reason: "expired_no_completion" })
    .eq("id", line.subject_id)

  await recordAudit(service, { orgId: line.org_id, table: "application_co_applicants", recordId: line.subject_id, action: "UPDATE", after: { declined_at: now, decline_reason: "expired_no_completion" } })

  // 14R: declining a non-completing line shrinks the roster — the REMAINING applicants may now be all-green, so fire
  // the "ready to submit" fan-out (arm is null while a line was pending, so this fires the first all-green).
  await maybeFireAllGreen(service, line.application_id)

  if (line.paid_at) {
    const { data: payment, error: paymentError } = await service
      .from("application_screening_payments")
      .select("id, fee_cents")
      .eq("application_id", line.application_id)
      .eq("subject_type", "co_applicant")
      .eq("subject_id", line.subject_id)
      .maybeSingle()
    logQueryError("expireDirectorLine application_screening_payments", paymentError)

    if (payment) {
      await service
        .from("application_screening_payments")
        .update({ expired_state: "paid_but_no_consent", refund_amount_cents: payment.fee_cents })
        .eq("id", payment.id)

      await recordAudit(service, { orgId: line.org_id, table: "application_screening_payments", recordId: payment.id, action: "UPDATE", after: { expired_state: "paid_but_no_consent", refund_amount_cents: payment.fee_cents } })
    }
  }

  await sendEmail({
    orgId: line.org_id,
    templateKey: "application.director_expired_refund",
    to: { email: coApp.applicant_email, name: coApp.first_name ?? "Director" },
    subject: `Your application portion has expired — ${propertyLabel}`,
    contentHtml: buildExpiryHtml({ directorFirstName: coApp.first_name ?? "Director", propertyLabel, primaryContactName, paid: !!line.paid_at }),
    entityType: "application_co_applicant", entityId: line.subject_id,
    triggerEventType: "cron:screening_portal_reminders", triggerEventId: line.application_id,
  })

  return "expired"
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

  // Who ACTUALLY paid this line. Previously `paidByPrimary: !!line.paid_at` — "the line is paid" inferred
  // as "someone else paid it", so a director who had paid their OWN portion and simply not consented yet
  // was told "{primary} has already paid for your portion". application_screening_payments records
  // paid_by_email / paid_by_user_id; read the fact rather than infer it.
  const { data: payment, error: paymentError } = await service
    .from("application_screening_payments")
    .select("paid_at, paid_by_email")
    .eq("application_id", line.application_id)
    .eq("subject_type", "co_applicant")
    .eq("subject_id", line.subject_id)
    .maybeSingle()
  logQueryError("sendMilestoneReminder application_screening_payments", paymentError)

  // Paid, and NOT by this director themselves. A null payer is unattributable, so we do not claim
  // somebody else paid — the copy only appears when we can actually stand behind it.
  const payerEmail = payment?.paid_by_email?.trim().toLowerCase() ?? null
  const directorEmail = coApp.applicant_email?.trim().toLowerCase() ?? null
  const paidBySomeoneElse = Boolean(payment?.paid_at) && payerEmail !== null && payerEmail !== directorEmail
  const portalUrl = absoluteUrl(`/apply/${slug || line.application_id}/director-portal/${coApp.access_token}`)

  const branding = buildBranding(await fetchOrgSettings(line.org_id))

  await sendEmail({
    orgId: line.org_id,
    templateKey: `application.director_reminder_${stage}`,
    to: { email: coApp.applicant_email, name: coApp.first_name ?? "Director" },
    subject: `Reminder: your portion is still outstanding — ${propertyLabel}`,
    emailElement: buildDirectorReminderElement({
      directorFirstName: coApp.first_name ?? "Director",
      primaryContactName, propertyLabel, portalUrl,
      daysRemaining: Math.max(0, 14 - daysElapsed),
      stage, paidByPrimary: paidBySomeoneElse,
      branding,
    }),
    entityType: "application_co_applicant", entityId: line.subject_id,
    triggerEventType: "cron:screening_portal_reminders", triggerEventId: line.application_id,
  })

  await service
    .from("application_co_applicants")
    .update({ reminder_milestones_sent: { ...sent, [stage]: true } })
    .eq("id", line.subject_id)

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
<p>The application cannot proceed until all directors have completed payment and consent.</p>
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

function buildExpiryHtml(p: { directorFirstName: string; propertyLabel: string; primaryContactName: string; paid: boolean }): string {
  const refundNote = p.paid
    ? `<p>You had paid your screening fee. The agency will process your refund — please contact them directly if you have not received it within 5 business days.</p>`
    : ""
  // A FRAGMENT — sendEmail wraps it in the central EmailLayout and injects the org's branding.
  return `
<p>Hi ${p.directorFirstName},</p>
<p>Your portion of the application for <strong>${p.propertyLabel}</strong> has expired as the 14-day window has passed without completion.</p>
${refundNote}
<p>The application has been notified to ${p.primaryContactName}. If you still want to participate, please ask them to add you again.</p>`
}
