/**
 * app/api/status/route.ts — Public system status JSON (ISR 60s)
 *
 * Route:  GET /api/status
 * Auth:   public — no user data exposed; ISR-cached at 60s prevents abuse
 * Data:   checkHealth() (internal) + Better Stack incidents API (optional, graceful degradation)
 * Notes:  Compatible with statuspage.io JSON convention for third-party integrations.
 *         Better Stack incidents omitted if BETTERSTACK_API_KEY is not set.
 */
import { NextResponse } from "next/server"
import { checkHealth, fetchBetterStackIncidents, type Incident } from "@/lib/observability/health"

export const revalidate = 60

interface StatusResponse {
  status:              "ok" | "degraded" | "down"
  updated_at:          string
  components:          Record<string, { name: string; status: string }>
  uptime_30d_percent:  number | null
  incidents_last_7d:   Incident[]
}

export async function GET() {
  const [health, incidents] = await Promise.all([
    checkHealth(),
    fetchBetterStackIncidents(),
  ])

  // App component is "down" iff DB is down (aggregate rule); degraded means non-critical services only.
  const appStatus = health.status === "down" ? "down" : "ok"

  const body: StatusResponse = {
    status:     health.status,
    updated_at: health.timestamp,
    components: {
      app:     { name: "App (app.pleks.co.za)", status: appStatus },
      db:      { name: "Database",              status: health.components.db.status },
      email:   { name: "Email delivery",        status: health.components.email.status },
      storage: { name: "File storage",          status: health.components.storage.status },
      crons:   { name: "Scheduled jobs",        status: health.components.crons.status },
    },
    uptime_30d_percent: null,
    incidents_last_7d:  incidents,
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  })
}
