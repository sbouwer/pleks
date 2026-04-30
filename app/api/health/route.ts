/**
 * app/api/health/route.ts — Shallow liveness probe for uptime monitoring
 *
 * Route:  GET /api/health
 * Auth:   public — external monitors ping without auth
 * Notes:  nodejs runtime for consistent process.env access.
 *         Does NOT touch Supabase or any downstream service — abuse-safe.
 *         Deep probe with component breakdown at /api/health/deep (token-gated).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  return Response.json(
    {
      status:      "ok",
      version:     process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "unknown",
      timestamp:   new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  )
}

export function HEAD() {
  return new Response(null, {
    status:  200,
    headers: { "Cache-Control": "no-store" },
  })
}
