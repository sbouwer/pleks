/**
 * app/api/health/route.ts — Shallow liveness probe for uptime monitoring
 *
 * Route:  GET /api/health
 * Auth:   public — external monitors ping without auth
 * Notes:  nodejs runtime for consistent process.env access.
 *         Does NOT touch Supabase or any downstream service — abuse-safe.
 *         Deep probe with component breakdown at /api/health/deep (token-gated).
 */
import { APP_VERSION, SENTRY_ENVIRONMENT_PUBLIC } from "@/lib/env"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET() {
  return Response.json(
    {
      status:      "ok",
      version:     APP_VERSION,
      environment: SENTRY_ENVIRONMENT_PUBLIC,
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
