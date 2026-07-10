/**
 * app/api/cron/check-links/route.ts — daily external link health check
 *
 * Route:  GET /api/cron/check-links
 * Auth:   x-cron-secret header (CRON_SECRET env var) — called from daily cron orchestrator
 * Data:   external_links table (source of truth — admin-editable via admin panel)
 * Notes:  HEAD-checks every URL with a browser User-Agent (bot-blockers 404 UA-less requests — the false-positive
 *         cause). Falls back to GET on ANY non-OK status; only declares a link broken if the GET also fails.
 *         Writes last_checked_at/last_status/is_healthy/last_ok_at + consecutive_failures back to DB. Emails
 *         ADMIN_EMAIL only after a link fails ALERT_AFTER_CONSECUTIVE_FAILURES checks in a row (debounce — kills
 *         transient/bot-block flaps). Fix = update URL in admin panel (or lib/external-links.ts + re-seed).
 */
import { NextRequest } from "next/server"
import { sendEmail } from "@/lib/comms/send-email"
import { PLATFORM_ORG_ID, preformatted } from "@/lib/comms/platform-org"
import { createServiceClient } from "@/lib/supabase/server"
import { withCronRun } from "@/lib/cron/withCronRun"

// Browser-like UA — Google/CDNs bot-block UA-less HEAD/GET requests, which is what produced the false-positive
// 404s (a live support.google.com page reported broken). Sent on both the HEAD and the GET (C-2).
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
// Debounce: alert only once a link has failed this many consecutive checks — transient blips / bot-block flaps
// self-heal on the next run and never raise an alert (C-2).
const ALERT_AFTER_CONSECUTIVE_FAILURES = 3

type DbLink = {
  key:      string
  url:      string
  label:    string
  category: string
  consecutive_failures: number
}

type LinkResult = DbLink & {
  ok:      boolean
  status?: number
  error?:  string
}

export const GET = withCronRun("check_links", handler)

async function handler(_req: NextRequest): Promise<Response> {

  const service = await createServiceClient()

  // Read URLs from DB — admin can update these without a code deployment
  const { data: links, error: fetchError } = await service
    .from("external_links")
    .select("key, url, label, category, consecutive_failures")
    .order("category")

  if (fetchError || !links) {
    console.error("check-links: failed to read external_links table", fetchError)
    return Response.json({ ok: false, error: fetchError?.message }, { status: 500 })
  }

  const results = await checkLinks(links)
  const failures = results.filter(r => !r.ok)
  const now = new Date().toISOString()

  // Write health check results back to DB — reset the failure streak on a healthy check, increment on a failed one
  await Promise.all(
    results.map(r =>
      service.from("external_links").update({
        last_checked_at:      now,
        last_status:          r.status ?? null,
        is_healthy:           r.ok,
        consecutive_failures: r.ok ? 0 : r.consecutive_failures + 1,
        ...(r.ok ? { last_ok_at: now } : {}),
      }).eq("key", r.key)
    )
  )

  // Debounce: only alert on links that have now failed ALERT_AFTER_CONSECUTIVE_FAILURES checks in a row.
  // A first/transient failure (incl. a bot-block flap) self-heals on the next run and never raises an alert.
  const alertable = failures.filter(r => r.consecutive_failures + 1 >= ALERT_AFTER_CONSECUTIVE_FAILURES)
  if (alertable.length > 0) {
    await alertFailures(alertable)
  }

  // Run-outcome respects the SAME debounce as the alert: a transient/self-healing blip (below the
  // consecutive-failure threshold) is recorded in metadata.failures for observability but does NOT mark
  // the cron_runs row failed — otherwise the daily failure-digest nags on every bot-block flap even though
  // no link is actually broken. Only a persistent (alertable) failure fails the run. (C-2 follow-on.)
  return Response.json({
    ok:       alertable.length === 0,
    checked:  results.length,
    failures: failures.length,
    alerted:  alertable.length,
    results,
  })
}

async function checkLinks(links: DbLink[]): Promise<LinkResult[]> {
  return Promise.all(
    links.map(async (link): Promise<LinkResult> => {
      const headers = { "User-Agent": BROWSER_UA }
      try {
        const res = await fetch(link.url, {
          method:   "HEAD",
          redirect: "follow",
          headers,
          signal:   AbortSignal.timeout(10_000),
        })
        if (res.ok) return { ...link, ok: true, status: res.status }
        // HEAD is unreliable across the web (many hosts 403/404/405 it) — only declare a link broken if a real
        // GET ALSO fails. Fall back on ANY non-OK status, not just 405 (C-2).
        const get = await fetch(link.url, { method: "GET", redirect: "follow", headers, signal: AbortSignal.timeout(10_000) })
        return { ...link, ok: get.ok, status: get.status }
      } catch (err) {
        return { ...link, ok: false, error: String(err) }
      }
    })
  )
}

async function alertFailures(failures: LinkResult[]) {
  const adminEmail = process.env.ADMIN_EMAIL
  const resendKey  = process.env.RESEND_API_KEY
  if (!adminEmail || !resendKey) {
    console.error("check-links: failures detected but ADMIN_EMAIL/RESEND_API_KEY not set", failures)
    return
  }

  const lines = failures
    .map(f => {
      const outcome = f.status == null ? (f.error ?? "unknown error") : `HTTP ${f.status}`
      return `  • [${f.key}] ${f.label}\n    ${f.url}\n    → ${outcome}`
    })
    .join("\n\n")

  // Was a raw resend.emails.send with a `text:` body — now the central branded template. preformatted()
  // escapes first: a broken URL legitimately contains & and can contain <.
  const body = [
    `The daily link check found ${failures.length} unreachable external link${failures.length === 1 ? "" : "s"}:\n`,
    lines,
    "\nFix: update the URL in the admin panel (/admin/external-links) or directly in Supabase.",
    "The next daily check will clear the alert once the URL is reachable again.",
  ].join("\n")

  const result = await sendEmail({
    orgId:       PLATFORM_ORG_ID,
    templateKey: "ops.link_check",
    to:          { email: adminEmail, name: "Pleks admin" },
    subject:     `[Pleks] ${failures.length} broken external link${failures.length === 1 ? "" : "s"} detected`,
    contentHtml: preformatted(body),
  })

  if (!result.success) console.error("check-links alert email failed:", result.error)
}
