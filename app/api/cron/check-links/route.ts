/**
 * app/api/cron/check-links/route.ts — daily external link health check
 *
 * Route:  GET /api/cron/check-links
 * Auth:   x-cron-secret header (CRON_SECRET env var) — called from daily cron orchestrator
 * Data:   external_links table (source of truth — admin-editable via admin panel)
 * Notes:  HEAD-checks every URL in the external_links table. Falls back to GET on 405.
 *         Writes last_checked_at, last_status, is_healthy, last_ok_at back to DB.
 *         Emails ADMIN_EMAIL when any URL is unhealthy; fix = update URL in admin panel
 *         (or in lib/external-links.ts + re-seed the table).
 */
import { NextRequest } from "next/server"
import { Resend } from "resend"
import { createServiceClient } from "@/lib/supabase/server"

type DbLink = {
  key:      string
  url:      string
  label:    string
  category: string
}

type LinkResult = DbLink & {
  ok:      boolean
  status?: number
  error?:  string
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()

  // Read URLs from DB — admin can update these without a code deployment
  const { data: links, error: fetchError } = await service
    .from("external_links")
    .select("key, url, label, category")
    .order("category")

  if (fetchError || !links) {
    console.error("check-links: failed to read external_links table", fetchError)
    return Response.json({ ok: false, error: fetchError?.message }, { status: 500 })
  }

  const results = await checkLinks(links)
  const failures = results.filter(r => !r.ok)
  const now = new Date().toISOString()

  // Write health check results back to DB
  await Promise.all(
    results.map(r =>
      service.from("external_links").update({
        last_checked_at: now,
        last_status:     r.status ?? null,
        is_healthy:      r.ok,
        ...(r.ok ? { last_ok_at: now } : {}),
      }).eq("key", r.key)
    )
  )

  if (failures.length > 0) {
    await alertFailures(failures)
  }

  return Response.json({
    ok:       failures.length === 0,
    checked:  results.length,
    failures: failures.length,
    results,
  })
}

async function checkLinks(links: DbLink[]): Promise<LinkResult[]> {
  return Promise.all(
    links.map(async (link): Promise<LinkResult> => {
      try {
        const res = await fetch(link.url, {
          method:   "HEAD",
          redirect: "follow",
          signal:   AbortSignal.timeout(10_000),
        })
        if (res.status === 405) {
          const get = await fetch(link.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10_000) })
          return { ...link, ok: get.ok, status: get.status }
        }
        return { ...link, ok: res.ok, status: res.status }
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

  const resend = new Resend(resendKey)
  const { error } = await resend.emails.send({
    from:    "Pleks <noreply@pleks.co.za>",
    to:      adminEmail,
    subject: `[Pleks] ${failures.length} broken external link${failures.length === 1 ? "" : "s"} detected`,
    text:    [
      `The daily link check found ${failures.length} unreachable external link${failures.length === 1 ? "" : "s"}:\n`,
      lines,
      "\nFix: update the URL in the admin panel (/admin/external-links) or directly in Supabase.",
      "The next daily check will clear the alert once the URL is reachable again.",
    ].join("\n"),
  })

  if (error) console.error("check-links alert email failed:", error)
}
