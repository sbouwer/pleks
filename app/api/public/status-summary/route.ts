/**
 * app/api/public/status-summary/route.ts — Aggregates BetterStack monitor statuses for StatusWidget
 *
 * Route:  GET /api/public/status-summary
 * Auth:   none — public endpoint
 * Data:   BetterStack Uptime API v2 /monitors (BETTERSTACK_API_KEY env var)
 * Notes:  cached 60s via Next.js revalidate. Fails silently — returns "operational"
 *         on any upstream error so the footer widget never alarms visitors.
 */
import { NextResponse } from "next/server"

const BETTERSTACK_API   = "https://uptime.betterstack.com/api/v2/monitors"
const BETTERSTACK_TOKEN = process.env.BETTERSTACK_API_KEY

export const revalidate = 60

export async function GET() {
  try {
    const res = await fetch(BETTERSTACK_API, {
      headers: { Authorization: `Bearer ${BETTERSTACK_TOKEN}` },
      next: { revalidate: 60 },
    })
    if (!res.ok) throw new Error("upstream")

    const { data } = await res.json() as { data: Array<{ attributes: { status: string } }> }
    const monitors = data.map(m => m.attributes.status)

    let status: "operational" | "degraded" | "outage" = "operational"
    if (monitors.some(s => s === "down"))    status = "outage"
    else if (monitors.some(s => s !== "up")) status = "degraded"

    return NextResponse.json({ status })
  } catch {
    return NextResponse.json({ status: "operational" })
  }
}
