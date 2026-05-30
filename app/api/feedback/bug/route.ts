/**
 * app/api/feedback/bug/route.ts — Create an enriched bug report (ADDENDUM_68 Slice 1)
 *
 * Route:  POST /api/feedback/bug
 * Auth:   Any authenticated Supabase user — org + role resolved server-side
 * Data:   feedback_submissions (category='bug') + bug_context, via service client
 * Notes:  Shares the 10/hour feedback rate limit. The one user-supplied field is
 *         `message`; subject is derived. All free text (message, console errors,
 *         scrubbed URL) is run through scrubString before persist — defence-in-depth
 *         on top of any client-side masking. No screenshots in Slice 1.
 */
import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isFeedbackRateLimited } from "@/lib/feedback/rate-limit"
import { createFeedbackSubmission, resolveSubmitterContext } from "@/lib/feedback/queries"
import { createBugContext, type BugConsoleError, type BugFailedRequest } from "@/lib/feedback/bug-context"
import { scrubString } from "@/lib/observability/scrubbing"

const MAX_CONTEXT_BYTES = 16_384
const ERROR_CAP   = 20
const REQUEST_CAP = 10

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null
}

function parseConsoleErrors(v: unknown): BugConsoleError[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, ERROR_CAP).map((e) => {
    const o = (e ?? {}) as Record<string, unknown>
    return {
      ts:      typeof o.ts === "number" ? o.ts : 0,
      level:   typeof o.level === "string" ? o.level : "error",
      message: scrubString(typeof o.message === "string" ? o.message.slice(0, 500) : ""),
    }
  })
}

function parseFailedRequests(v: unknown): BugFailedRequest[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, REQUEST_CAP).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    return {
      method: typeof o.method === "string" ? o.method.slice(0, 10) : "GET",
      path:   scrubString(typeof o.path === "string" ? o.path.slice(0, 300) : ""),
      status: typeof o.status === "number" ? o.status : 0,
      at:     typeof o.at === "number" ? o.at : 0,
    }
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  if (await isFeedbackRateLimited(user.id)) {
    return Response.json({ error: "Rate limit exceeded — 10 submissions per hour" }, { status: 429 })
  }

  const ctx = await resolveSubmitterContext(user.id)
  if (!ctx) return Response.json({ error: "Forbidden" }, { status: 403 })

  let parsed: Record<string, unknown>
  try { parsed = await req.json() as Record<string, unknown> }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const message = parsed.message
  if (typeof message !== "string" || message.trim().length < 10 || message.trim().length > 5000) {
    return Response.json({ error: "Please describe the problem (at least 10 characters)" }, { status: 400 })
  }
  const context = parsed.context
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return Response.json({ error: "Missing diagnostics context" }, { status: 400 })
  }
  if (JSON.stringify(context).length > MAX_CONTEXT_BYTES) {
    return Response.json({ error: "Diagnostics too large" }, { status: 413 })
  }

  const c = context as Record<string, unknown>
  const cleanMessage = scrubString(message.trim())
  const routePath = str(c.routePath) ?? "unknown"
  const subject = `${cleanMessage.slice(0, 60)} · ${routePath}`.slice(0, 200)

  const submission = await createFeedbackSubmission({
    orgId:       ctx.orgId,
    submitterId: user.id,
    role:        ctx.role,
    category:    "bug",
    subject,
    body:        cleanMessage,
  })
  if (!submission) return Response.json({ error: "Failed to save bug report" }, { status: 500 })

  await createBugContext({
    submissionId:    submission.id,
    routePath:       str(c.routePath),
    fullUrlScrubbed: str(c.fullUrlScrubbed) ? scrubString(c.fullUrlScrubbed as string) : null,
    referrerPath:    str(c.referrerPath),
    plekTrace:       str(c.plekTrace),
    xVercelId:       str(c.xVercelId),
    appVersion:      str(c.appVersion),
    userAgentParsed: str(c.userAgentParsed),
    viewport:        str(c.viewport),
    onlineState:     str(c.onlineState),
    pwaMode:         typeof c.pwaMode === "boolean" ? c.pwaMode : null,
    consoleErrors:   parseConsoleErrors(c.consoleErrors),
    failedRequests:  parseFailedRequests(c.failedRequests),
    clientTimestamp: str(c.clientTimestamp),
  })

  return Response.json({ ok: true, id: submission.id }, { status: 201 })
}
