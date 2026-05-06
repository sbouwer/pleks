/**
 * app/api/cron/check-links/route.ts — daily external link health check
 *
 * Route:  GET /api/cron/check-links
 * Auth:   x-cron-secret header (CRON_SECRET env var) — called from daily cron orchestrator
 * Notes:  HEAD-checks every URL in lib/external-links.ts. Falls back to GET on 405.
 *         Emails ADMIN_EMAIL when any URL is unreachable; fix = update external-links.ts.
 */
import { NextRequest } from "next/server"
import { Resend } from "resend"
import { EXTERNAL_LINKS, type ExternalLinkKey } from "@/lib/external-links"

type LinkResult = {
  key:     ExternalLinkKey
  url:     string
  ok:      boolean
  status?: number
  error?:  string
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results  = await checkLinks()
  const failures = results.filter(r => !r.ok)

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

async function checkLinks(): Promise<LinkResult[]> {
  return Promise.all(
    (Object.entries(EXTERNAL_LINKS) as [ExternalLinkKey, string][]).map(
      async ([key, url]): Promise<LinkResult> => {
        try {
          const res = await fetch(url, {
            method:   "HEAD",
            redirect: "follow",
            signal:   AbortSignal.timeout(10_000),
          })
          if (res.status === 405) {
            const get = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10_000) })
            return { key, url, ok: get.ok, status: get.status }
          }
          return { key, url, ok: res.ok, status: res.status }
        } catch (err) {
          return { key, url, ok: false, error: String(err) }
        }
      }
    )
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
    .map(f => `  • ${f.key}: ${f.url}\n    → ${f.status != null ? `HTTP ${f.status}` : f.error}`)
    .join("\n\n")

  const resend = new Resend(resendKey)
  const { error } = await resend.emails.send({
    from:    "Pleks <noreply@pleks.co.za>",
    to:      adminEmail,
    subject: `[Pleks] ${failures.length} broken external link${failures.length === 1 ? "" : "s"} detected`,
    text:    [
      `The daily link check found ${failures.length} unreachable external link${failures.length === 1 ? "" : "s"}:\n`,
      lines,
      "\nFix: update lib/external-links.ts — all pages that reference the key update automatically.",
    ].join("\n"),
  })

  if (error) console.error("check-links alert email failed:", error)
}
