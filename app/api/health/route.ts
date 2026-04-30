/**
 * app/api/health/route.ts — Uptime monitor health check endpoint
 *
 * Route:  GET /api/health
 * Auth:   public — uptime monitors ping without auth
 * Notes:  edge runtime for minimal cold-start latency (~10ms vs ~200ms Node.js).
 *         Returns immediately; ADDENDUM_00G expands this with an authenticated
 *         deep probe (DB / Resend / Storage / cron freshness).
 */
export const runtime = "edge"

export function GET() {
  return Response.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store, no-cache" } }
  )
}
