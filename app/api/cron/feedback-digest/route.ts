/**
 * app/api/cron/feedback-digest/route.ts — Daily feedback digest email to platform admin
 *
 * Route:  GET /api/cron/feedback-digest
 * Auth:   x-cron-secret header (CRON_SECRET env var) — called from daily cron orchestrator
 * Data:   feedback_submissions (today) via getTodayFeedbackDigest
 * Notes:  Sends to ADMIN_EMAIL env var. Skips silently if no submissions today.
 */
import { NextRequest } from "next/server"
import { Resend } from "resend"
import { getTodayFeedbackDigest } from "@/lib/feedback/queries"
import { FeedbackDailyDigestEmail } from "@/lib/comms/templates/feedback/feedback-daily-digest"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const items = await getTodayFeedbackDigest()
  if (items.length === 0) {
    return Response.json({ ok: true, skipped: true, reason: "No submissions today" })
  }

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return Response.json({ ok: false, error: "ADMIN_EMAIL not configured" }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const date = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })
  const inboxUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pleks.co.za"}/admin/feedback`

  const branding = {
    orgName:     "Pleks",
    accentColor: "#f59e0b",
    logoUrl:     undefined,
  }

  const { error } = await resend.emails.send({
    from:    "Pleks <noreply@pleks.co.za>",
    to:      adminEmail,
    subject: `[Pleks] Feedback digest — ${items.length} new submission${items.length === 1 ? "" : "s"} (${date})`,
    react:   FeedbackDailyDigestEmail({ branding, date, items, inboxUrl }),
  })

  if (error) {
    console.error("feedback-digest email failed:", error)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true, sent: items.length })
}
