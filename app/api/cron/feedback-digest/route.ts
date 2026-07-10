/**
 * app/api/cron/feedback-digest/route.ts — Daily feedback digest email to platform admin
 *
 * Route:  GET /api/cron/feedback-digest
 * Auth:   x-cron-secret header (CRON_SECRET env var) — called from daily cron orchestrator
 * Data:   feedback_submissions (today) via getTodayFeedbackDigest
 * Notes:  Sends to ADMIN_EMAIL env var. Skips silently if no submissions today.
 */
import { NextRequest } from "next/server"
import { sendEmail } from "@/lib/comms/send-email"
import { PLATFORM_ORG_ID } from "@/lib/comms/platform-org"
import { getTodayFeedbackDigest } from "@/lib/feedback/queries"
import { FeedbackDailyDigestEmail } from "@/lib/comms/templates/feedback/feedback-daily-digest"
import { requireCronAuth } from "@/lib/cron/auth"
import { APP_URL } from "@/lib/env"

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const items = await getTodayFeedbackDigest()
  if (items.length === 0) {
    return Response.json({ ok: true, skipped: true, reason: "No submissions today" })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return Response.json({ ok: false, error: "ADMIN_EMAIL not configured" }, { status: 500 })
  }

  const date = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })
  const inboxUrl = `${APP_URL}/admin/feedback`

  const branding = {
    orgName:     "Pleks",
    accentColor: "#f59e0b",
    logoUrl:     undefined,
  }

  // emailElement, not contentHtml: the digest is a real React Email template that renders its own
  // EmailLayout. Resend's `react:` option bypassed sendEmail entirely — this routes it through the
  // choke point, so it now gets a communication_log row and appears in the delivery-feedback loop.
  const result = await sendEmail({
    orgId:        PLATFORM_ORG_ID,
    templateKey:  "ops.feedback_digest",
    to:           { email: adminEmail, name: "Pleks admin" },
    subject:      `[Pleks] Feedback digest — ${items.length} new submission${items.length === 1 ? "" : "s"} (${date})`,
    emailElement: FeedbackDailyDigestEmail({ branding, date, items, inboxUrl }),
  })

  if (!result.success) {
    console.error("feedback-digest email failed:", result.error)
    return Response.json({ ok: false, error: result.error }, { status: 500 })
  }

  return Response.json({ ok: true, sent: items.length })
}
