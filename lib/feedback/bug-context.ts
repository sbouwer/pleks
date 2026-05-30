/**
 * lib/feedback/bug-context.ts — Persist + read enriched bug-report diagnostics (ADDENDUM_68 Slice 1)
 *
 * Auth:   Server-only — callers verify auth + org membership first (see /api/feedback/bug).
 * Data:   bug_context (1:1 with feedback_submissions) via service client (bypasses RLS).
 * Notes:  Text fields are scrubbed by the caller before insert. console_errors /
 *         failed_requests are stored as jsonb arrays; no request/response bodies.
 */
import { createServiceClient } from "@/lib/supabase/server"

export interface BugConsoleError { ts: number; level: string; message: string }
export interface BugFailedRequest { method: string; path: string; status: number; at: number }

export interface BugContext {
  submission_id:     string
  route_path:        string | null
  full_url_scrubbed: string | null
  referrer_path:     string | null
  pleks_trace:       string | null
  x_vercel_id:       string | null
  app_version:       string | null
  user_agent_parsed: string | null
  viewport:          string | null
  online_state:      string | null
  pwa_mode:          boolean | null
  console_errors:    BugConsoleError[]
  failed_requests:   BugFailedRequest[]
  client_timestamp:  string | null
  created_at:        string
}

export async function createBugContext(input: {
  submissionId:    string
  routePath:       string | null
  fullUrlScrubbed: string | null
  referrerPath:    string | null
  plekTrace:       string | null
  xVercelId:       string | null
  appVersion:      string | null
  userAgentParsed: string | null
  viewport:        string | null
  onlineState:     string | null
  pwaMode:         boolean | null
  consoleErrors:   BugConsoleError[]
  failedRequests:  BugFailedRequest[]
  clientTimestamp: string | null
}): Promise<boolean> {
  const service = await createServiceClient()
  const { error } = await service.from("bug_context").insert({
    submission_id:     input.submissionId,
    route_path:        input.routePath,
    full_url_scrubbed: input.fullUrlScrubbed,
    referrer_path:     input.referrerPath,
    pleks_trace:       input.plekTrace,
    x_vercel_id:       input.xVercelId,
    app_version:       input.appVersion,
    user_agent_parsed: input.userAgentParsed,
    viewport:          input.viewport,
    online_state:      input.onlineState,
    pwa_mode:          input.pwaMode,
    console_errors:    input.consoleErrors,
    failed_requests:   input.failedRequests,
    client_timestamp:  input.clientTimestamp,
  })
  if (error) {
    console.error("createBugContext failed:", error.message)
    return false
  }
  return true
}
