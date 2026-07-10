/**
 * lib/subscriptions/sendWithRetry.ts — retry net for agency-admin lifecycle emails (C-1 buckle)
 *
 * Notes: Subscription/billing emails go to the agency ADMIN, not a tenant, so they can't use the tenant-shaped
 *        mandatory_comm_retries queue (its attempt-3 delivery-fallback assumes a tenant). sendPlatformEmail
 *        sends via sendEmail and, on a transient failure, enqueues platform_email_retries — storing the rendered
 *        HTML so the retry is self-contained. drainPlatformEmailRetries (called hourly from the mandatory-retry
 *        cron) re-sends T+1h/6h/24h and surrenders after; a surrender surfaces in the daily cron digest.
 */
import { render } from "@react-email/components"
import { maskEmail } from "@/lib/log/maskPii"
import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail, type SendEmailParams, type SendEmailResult } from "@/lib/comms/send-email"

const RETRY_OFFSET_HOURS = [1, 6, 24] // attempt_count 1→+1h, 2→+6h, 3→+24h
const MAX_ATTEMPTS = RETRY_OFFSET_HOURS.length + 1 // initial send + 3 retries

function nextAttemptAt(attemptCount: number): string | null {
  const hours = RETRY_OFFSET_HOURS[attemptCount - 1] // attemptCount is 1-based
  if (hours == null) return null
  return new Date(Date.now() + hours * 3600 * 1000).toISOString()
}

/**
 * Send a platform (agency-admin) email with a retry net. Identical surface to sendEmail; on a transient send
 * failure it enqueues a platform_email_retries row that the hourly drain re-sends.
 */
export async function sendPlatformEmail(params: SendEmailParams): Promise<SendEmailResult> {
  // contentHtml is branded INSIDE sendEmail (it needs orgSettings to build the layout), so we cannot
  // snapshot the final HTML here — the retry row would be enqueued with `html: undefined` and the
  // enqueue guard below would silently skip it, losing the retry net. Fail loudly instead of quietly.
  if (params.contentHtml) {
    throw new Error("sendPlatformEmail: contentHtml is not supported — pass emailElement or rawHtml so the retry can replay the exact HTML")
  }
  // Render once up front so the retry can replay the exact HTML without the React element.
  const html = params.rawHtml ?? (params.emailElement ? await render(params.emailElement) : undefined)
  const result = await sendEmail({ ...params, rawHtml: html, emailElement: undefined })

  if (!result.success && html && params.to.email) {
    try {
      const db = await createServiceClient()
      const { error } = await db.from("platform_email_retries").insert({
        org_id:               params.orgId,
        template_key:         params.templateKey,
        communication_log_id: result.logId ?? null,
        to_email:             params.to.email,
        to_name:              params.to.name ?? null,
        subject:              params.subject,
        body_html:            html,
        attempt_count:        1,
        next_attempt_at:      nextAttemptAt(1),
        last_error:           result.error ?? null,
      })
      if (error) console.error("[platform-email] failed to enqueue retry:", error.message)
    } catch (e) {
      console.error("[platform-email] enqueue threw:", e instanceof Error ? e.message : String(e))
    }
  }

  return result
}

interface RetryRow {
  id: string
  org_id: string
  template_key: string
  to_email: string
  to_name: string | null
  subject: string
  body_html: string
  attempt_count: number
}

/**
 * Drain due platform_email_retries: re-send via the stored HTML, delete on success, advance the cascade or
 * surrender after MAX_ATTEMPTS. Called hourly from the mandatory-retry cron. Returns counts for the digest.
 */
export async function drainPlatformEmailRetries(): Promise<{ resent: number; surrendered: number; pending: number }> {
  const db = await createServiceClient()
  const { data: rows, error } = await db
    .from("platform_email_retries")
    .select("id, org_id, template_key, to_email, to_name, subject, body_html, attempt_count")
    .lte("next_attempt_at", new Date().toISOString())
    .is("surrendered_at", null)
    .order("next_attempt_at")
    .limit(50)
  if (error) {
    console.error("[platform-email] drain fetch failed:", error.message)
    return { resent: 0, surrendered: 0, pending: 0 }
  }

  let resent = 0
  let surrendered = 0
  for (const row of (rows ?? []) as RetryRow[]) {
    const result = await sendEmail({
      orgId:       row.org_id,
      templateKey: row.template_key,
      to:          { email: row.to_email, name: row.to_name ?? row.to_email },
      subject:     row.subject,
      rawHtml:     row.body_html,
    })

    if (result.success) {
      await db.from("platform_email_retries").delete().eq("id", row.id).eq("org_id", row.org_id)
      resent++
      continue
    }

    const newAttempt = row.attempt_count + 1
    if (newAttempt >= MAX_ATTEMPTS) {
      await db.from("platform_email_retries").update({
        surrendered_at:   new Date().toISOString(),
        surrender_reason: "max_attempts_exhausted",
        last_error:       result.error ?? null,
        updated_at:       new Date().toISOString(),
      }).eq("id", row.id)
      // The original failure already hit the daily digest; this records that all retries also failed, so the
      // agency-admin email (e.g. payment-failed) never landed — visible in Vercel logs / Sentry.
      console.error(`[platform-email] SURRENDERED after ${MAX_ATTEMPTS} attempts — ${row.template_key} to ${maskEmail(row.to_email)} (org ${row.org_id}): ${result.error ?? "unknown"}`)
      surrendered++
    } else {
      await db.from("platform_email_retries").update({
        attempt_count:   newAttempt,
        next_attempt_at: nextAttemptAt(newAttempt),
        last_error:      result.error ?? null,
        updated_at:      new Date().toISOString(),
      }).eq("id", row.id)
    }
  }

  return { resent, surrendered, pending: (rows ?? []).length - resent - surrendered }
}
