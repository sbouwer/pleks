/**
 * app/api/cron/screening-portal-reminders/route.ts — Daily reminder cron for commercial portal completion
 *
 * Route:  GET /api/cron/screening-portal-reminders
 * Auth:   x-cron-secret header
 * Notes:  Called from /api/cron/daily orchestrator. Processes T+3 / T+7 / T+10 / T+14 milestones
 *         for surety directors who have not yet completed their portal portions.
 *         T+14: director line cancelled, payment flagged for manual refund (14C), expiry email sent.
 *         Primary contact notified at T+7 and T+10 (informational only).
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/comms/send-email"
import { buildDirectorReminderHtml } from "@/lib/applications/commercial"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()
  let reminders = 0
  let expirations = 0

  try {
    const { data: lines, error } = await service
      .from("v_application_screening_lines")
      .select("application_id, subject_id, subject_name, org_id, paid_at")
      .eq("subject_type", "co_applicant")
      .in("state", ["pending_both", "paid_pending_consent", "consented_pending_payment"])
      .limit(500)

    if (error) {
      console.error("[screening-portal-reminders] view query failed:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    for (const line of lines ?? []) {
      try {
        const result = await processDirectorLine(service, line)
        if (result === "reminded") reminders++
        if (result === "expired") expirations++
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

  return NextResponse.json({ ok: true, reminders, expirations })
}

type PendingLine = {
  application_id: string
  subject_id: string
  subject_name: string
  org_id: string
  paid_at: string | null
}

type LineOutcome = "reminded" | "expired" | "skipped"

async function processDirectorLine(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  line: PendingLine,
): Promise<LineOutcome> {
  const { data: coApp, error: coErr } = await service
    .from("application_co_applicants")
    .select("applicant_email, first_name, created_at, primary_application_id, access_token")
    .eq("id", line.subject_id)
    .is("declined_at", null)
    .single()

  if (coErr || !coApp) return "skipped"

  const daysElapsed = Math.floor((Date.now() - new Date(coApp.created_at as string).getTime()) / 86_400_000)

  let stage: "t3" | "t7" | "t10" | "expire" | null = null
  if (daysElapsed >= 14) stage = "expire"
  else if (daysElapsed === 10) stage = "t10"
  else if (daysElapsed === 7) stage = "t7"
  else if (daysElapsed === 3) stage = "t3"

  if (!stage) return "skipped"

  const { data: app } = await service
    .from("applications")
    .select("first_name, last_name, applicant_email, listings(public_slug, units(unit_number, properties(name)))")
    .eq("id", line.application_id)
    .single()

  if (!app) return "skipped"

  const listing = app.listings as unknown as {
    public_slug: string
    units: { unit_number: string; properties: { name: string } }
  } | null

  const slug = listing?.public_slug ?? line.application_id
  const propertyLabel = listing
    ? [listing.units?.unit_number, listing.units?.properties?.name].filter(Boolean).join(" — ")
    : "the property"
  const primaryContactName = [app.first_name, app.last_name].filter(Boolean).join(" ") || "the applicant"
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/apply/${slug}/director-portal/${coApp.access_token as string}`

  if (stage === "expire") {
    await service
      .from("application_co_applicants")
      .update({ declined_at: new Date().toISOString(), decline_reason: "expired_no_completion" })
      .eq("id", line.subject_id)

    if (line.paid_at) {
      const { data: payment } = await service
        .from("application_screening_payments")
        .select("id, fee_cents")
        .eq("application_id", line.application_id)
        .eq("subject_type", "co_applicant")
        .eq("subject_id", line.subject_id)
        .maybeSingle()

      if (payment) {
        await service
          .from("application_screening_payments")
          .update({ expired_state: "paid_but_no_consent", refund_amount_cents: payment.fee_cents })
          .eq("id", payment.id)
      }
    }

    await sendEmail({
      orgId: line.org_id,
      templateKey: "application.director_expired_refund",
      to: { email: coApp.applicant_email as string, name: (coApp.first_name as string | null) ?? "Director" },
      subject: `Your application portion has expired — ${propertyLabel}`,
      rawHtml: buildExpiryHtml({
        directorFirstName: (coApp.first_name as string | null) ?? "Director",
        propertyLabel,
        primaryContactName,
        paid: !!line.paid_at,
      }),
      entityType: "application_co_applicant",
      entityId: line.subject_id,
      triggerEventType: "cron:screening_portal_reminders",
      triggerEventId: line.application_id,
    })

    return "expired"
  }

  // T+3 / T+7 / T+10 reminder
  const templateKey = `application.director_reminder_${stage}` as
    | "application.director_reminder_t3"
    | "application.director_reminder_t7"
    | "application.director_reminder_t10"

  const daysRemaining = Math.max(0, 14 - daysElapsed)
  const paidByPrimary = !!line.paid_at

  await sendEmail({
    orgId: line.org_id,
    templateKey,
    to: { email: coApp.applicant_email as string, name: (coApp.first_name as string | null) ?? "Director" },
    subject: `Reminder: your portion is still outstanding — ${propertyLabel}`,
    rawHtml: buildDirectorReminderHtml({
      directorFirstName: (coApp.first_name as string | null) ?? "Director",
      primaryContactName,
      propertyLabel,
      portalUrl,
      daysRemaining,
      stage,
      paidByPrimary,
    }),
    entityType: "application_co_applicant",
    entityId: line.subject_id,
    triggerEventType: "cron:screening_portal_reminders",
    triggerEventId: line.application_id,
  })

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
  const { data: app } = await service
    .from("applications")
    .select("applicant_email")
    .eq("id", line.application_id)
    .single()

  if (!app?.applicant_email) return

  const urgency = ctx.stage === "t10" ? "Final reminder: " : ""
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px}p{line-height:1.6}</style></head><body>
<p>Hi ${ctx.primaryContactName},</p>
<p>${urgency}<strong>${ctx.directorName}</strong> has not yet completed their portion of the application for <strong>${ctx.propertyLabel}</strong>.</p>
<p>The application cannot proceed until all directors have completed payment and consent.</p>
<p>If ${ctx.directorName} is unable to proceed, you can replace them from your application portal.</p>
</body></html>`

  await sendEmail({
    orgId: line.org_id,
    templateKey: "application.primary_contact_director_pending",
    to: { email: app.applicant_email as string, name: ctx.primaryContactName },
    subject: `Action needed: ${ctx.directorName} has not completed their portion`,
    rawHtml: html,
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
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px}p{line-height:1.6}</style></head><body>
<p>Hi ${p.directorFirstName},</p>
<p>Your portion of the application for <strong>${p.propertyLabel}</strong> has expired as the 14-day window has passed without completion.</p>
${refundNote}
<p>The application has been notified to ${p.primaryContactName}. If you still want to participate, please ask them to add you again.</p>
</body></html>`
}
