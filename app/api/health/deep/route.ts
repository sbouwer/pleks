/**
 * app/api/health/deep/route.ts — Authenticated deep health probe
 *
 * Route:  GET /api/health/deep?token=...
 * Auth:   HEALTH_PROBE_TOKEN query param — configured in Better Stack, not publicly documented
 * Data:   prime_rates (DB), Resend domains API (email), storage.listBuckets, cron_runs
 * Notes:  Probes all 4 components in parallel; 1.5s per-component timeout.
 *         Returns 503 iff DB is down; 200 for ok or degraded (check JSON body).
 *         Run by Better Stack every 5 min from EU only — not the shallow 1-min monitor.
 */
import { NextRequest, NextResponse } from "next/server"
import { checkHealth } from "@/lib/observability/health"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!token || token !== process.env.HEALTH_PROBE_TOKEN) {
    return new NextResponse("Unauthorised", { status: 401 })
  }

  const health = await checkHealth()
  return NextResponse.json(health, {
    status:  health.status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  })
}
