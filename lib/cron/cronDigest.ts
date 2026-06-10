/**
 * lib/cron/cronDigest.ts — failure-only daily cron digest (ADDENDUM_CRON_RELIABILITY C-1, the "surface")
 *
 * Notes: ONE email to ADMIN_EMAIL summarising the daily orchestrator run, sent ONLY when something went wrong —
 *        a job errored/failed, or (off the C-1 belt's { sent, failed }) emails failed to send. A clean run sends
 *        nothing (no-news-is-good-news). Best-effort + guarded: no-op (logged) if ADMIN_EMAIL/RESEND_API_KEY
 *        unset. Mirrors the check-links ADMIN_EMAIL alert pattern.
 */
import { Resend } from "resend"

export interface CronJobDetail {
  status: string            // "ok" | "failed" | "error" | "partial" | "skipped (…)"
  sent?: number             // from the C-1 belt's Response.json
  failed?: number
  error?: string
}

function isIssue(d: CronJobDetail): boolean {
  return d.status === "failed" || d.status === "error" || d.status === "partial" || (d.failed ?? 0) > 0
}

export async function sendCronDigest(
  ranAt: string,
  detail: Record<string, CronJobDetail>,
): Promise<{ emailed: boolean; issueCount: number }> {
  const issues = Object.entries(detail).filter(([, d]) => isIssue(d))
  if (issues.length === 0) return { emailed: false, issueCount: 0 }   // clean run → silence

  const adminEmail = process.env.ADMIN_EMAIL
  const resendKey = process.env.RESEND_API_KEY
  if (!adminEmail || !resendKey) {
    console.error("[cron-digest] issues detected but ADMIN_EMAIL/RESEND_API_KEY not set:", issues.map(([n]) => n))
    return { emailed: false, issueCount: issues.length }
  }

  const issueLines = issues
    .map(([name, d]) => {
      if ((d.failed ?? 0) > 0 && d.status !== "error" && d.status !== "failed") {
        return `  ⚠ ${name}: ${d.failed} email(s) failed to send (${d.sent ?? 0} sent)`
      }
      return `  ✗ ${name}: ${d.status}${d.error ? ` — ${d.error}` : ""}`
    })
    .join("\n")

  const allLines = Object.entries(detail)
    .map(([name, d]) => {
      const counts = d.sent != null || d.failed != null ? ` (sent ${d.sent ?? 0}, failed ${d.failed ?? 0})` : ""
      return `  ${name}: ${d.status}${counts}`
    })
    .join("\n")

  const resend = new Resend(resendKey)
  const { error } = await resend.emails.send({
    from:    "Pleks <noreply@pleks.co.za>",
    to:      adminEmail,
    subject: `[Pleks] daily cron — ${issues.length} issue${issues.length === 1 ? "" : "s"}`,
    text: [
      `The daily cron run at ${ranAt} completed with ${issues.length} issue${issues.length === 1 ? "" : "s"}:\n`,
      issueLines,
      "\n— full run —",
      allLines,
      "\nThis digest is sent only when something fails. A clean run sends nothing.",
    ].join("\n"),
  })

  if (error) {
    console.error("[cron-digest] email failed:", error)
    return { emailed: false, issueCount: issues.length }
  }
  return { emailed: true, issueCount: issues.length }
}
