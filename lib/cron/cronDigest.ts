/**
 * lib/cron/cronDigest.ts — failure-only daily cron digest (ADDENDUM_CRON_RELIABILITY C-1, the "surface")
 *
 * Notes: ONE email to ADMIN_EMAIL summarising the daily orchestrator run, sent ONLY when something went wrong —
 *        a job errored/failed, or (off the C-1 belt's { sent, failed }) emails failed to send. A clean run sends
 *        nothing (no-news-is-good-news). Best-effort + guarded: no-op (logged) if ADMIN_EMAIL/RESEND_API_KEY
 *        unset. Mirrors the check-links ADMIN_EMAIL alert pattern.
 */
import { sendEmail } from "@/lib/comms/send-email"
import { PLATFORM_ORG_ID, preformatted } from "@/lib/comms/platform-org"
import { optionalEnv } from "@/lib/env"

export interface CronJobDetail {
  status: string            // "ok" | "failed" | "error" | "partial" | "skipped (…)"
  sent?: number             // from the C-1 belt's Response.json
  failed?: number
  /**
   * Work the job deliberately held back because it could not establish a precondition — today,
   * M-074's purge gate refusing to delete an org whose 30-day warning was never delivered.
   *
   * Its own field rather than a bump to `failed`: the job ran correctly and nothing errored, so
   * every other signal reads green, yet a human must act or the row defers forever — and
   * indefinite retention is a POPIA failure in its own right. Folded into `failed` it would read
   * as "N emails bounced" and be chased down the wrong path.
   */
  deferred?: number
  error?: string
}

/**
 * Exported for probing. This predicate is the ONLY thing standing between "the cron held work back"
 * and silence — a digest that does not classify a deferral as an issue sends nothing, and the
 * deferral is then invisible everywhere (M-074 part 3). Worth a test of its own.
 */
export function isIssue(d: CronJobDetail): boolean {
  return d.status === "failed" || d.status === "error" || d.status === "partial"
    || (d.failed ?? 0) > 0 || (d.deferred ?? 0) > 0
}

export async function sendCronDigest(
  ranAt: string,
  detail: Record<string, CronJobDetail>,
): Promise<{ emailed: boolean; issueCount: number }> {
  const issues = Object.entries(detail).filter(([, d]) => isIssue(d))
  if (issues.length === 0) return { emailed: false, issueCount: 0 }   // clean run → silence

  const adminEmail = optionalEnv("ADMIN_EMAIL")
  const resendKey = optionalEnv("RESEND_API_KEY")
  if (!adminEmail || !resendKey) {
    console.error("[cron-digest] issues detected but ADMIN_EMAIL/RESEND_API_KEY not set:", issues.map(([n]) => n))
    return { emailed: false, issueCount: issues.length }
  }

  const issueLines = issues
    .map(([name, d]) => {
      if ((d.deferred ?? 0) > 0) {
        return `  ⏸ ${name}: ${d.deferred} item(s) HELD BACK pending a human — see subscriptions.purge_deferred_reason`
      }
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

  // Was a raw resend.emails.send with a `text:` body. sendEmail has no text channel, and this report is
  // column-aligned, so it ships as a monospace <pre> fragment through the central branded template.
  const body = [
    `The daily cron run at ${ranAt} completed with ${issues.length} issue${issues.length === 1 ? "" : "s"}:\n`,
    issueLines,
    "\n— full run —",
    allLines,
    "\nThis digest is sent only when something fails. A clean run sends nothing.",
  ].join("\n")

  const result = await sendEmail({
    orgId:       PLATFORM_ORG_ID,
    templateKey: "ops.cron_digest",
    to:          { email: adminEmail, name: "Pleks admin" },
    subject:     `[Pleks] daily cron — ${issues.length} issue${issues.length === 1 ? "" : "s"}`,
    contentHtml: preformatted(body),
  })

  if (!result.success) {
    console.error("[cron-digest] email failed:", result.error)
    return { emailed: false, issueCount: issues.length }
  }
  return { emailed: true, issueCount: issues.length }
}
