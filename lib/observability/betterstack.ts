/**
 * lib/observability/betterstack.ts — Better Stack Uptime API client
 *
 * Auth:   server-only — uses BETTERSTACK_API_KEY
 * Data:   GET /api/v2/monitors, /api/v2/incidents
 * Notes:  All functions are safe to call from ISR pages (Next.js fetch caching).
 *         Returns empty arrays on missing key or network failure — never throws.
 */

const BASE = "https://uptime.betterstack.com/api/v2"

export type MonitorStatus = "up" | "down" | "paused" | "pending" | "maintenance" | "validating"

export interface Monitor {
  id:               string
  name:             string
  url:              string
  status:           MonitorStatus
  availability:     number   // percentage 0–100
  checkFrequency:   number   // seconds
  lastCheckedAt:    string | null
}

export interface BsIncident {
  id:          string
  name:        string
  startedAt:   string
  resolvedAt:  string | null
  cause:       string
}

interface RawMonitor {
  id: string
  attributes: {
    pronounceable_name?: string
    url?:                string
    status?:             MonitorStatus
    availability?:       number
    check_frequency?:    number
    last_checked_at?:    string | null
  }
}

interface RawIncident {
  id: string
  attributes: {
    name?:        string
    started_at?:  string
    resolved_at?: string | null
    cause?:       string
  }
}

async function bsFetch<T>(path: string, revalidate = 60): Promise<T | null> {
  const key = process.env.BETTERSTACK_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate },
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

export async function fetchMonitors(): Promise<Monitor[]> {
  const json = await bsFetch<{ data?: RawMonitor[] }>("/monitors?per_page=50")
  if (!json?.data) return []
  return json.data.map(m => ({
    id:             m.id,
    name:           m.attributes.pronounceable_name ?? m.attributes.url ?? m.id,
    url:            m.attributes.url ?? "",
    status:         m.attributes.status ?? "pending",
    availability:   m.attributes.availability ?? 100,
    checkFrequency: m.attributes.check_frequency ?? 60,
    lastCheckedAt:  m.attributes.last_checked_at ?? null,
  }))
}

export async function fetchIncidents(days = 7): Promise<BsIncident[]> {
  const json = await bsFetch<{ data?: RawIncident[] }>("/incidents?per_page=20")
  if (!json?.data) return []
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return json.data
    .filter(i => {
      const d = i.attributes.started_at
      return d ? new Date(d).getTime() > cutoff : false
    })
    .map(i => ({
      id:         i.id,
      name:       i.attributes.name ?? "Incident",
      startedAt:  i.attributes.started_at ?? "",
      resolvedAt: i.attributes.resolved_at ?? null,
      cause:      i.attributes.cause ?? "",
    }))
}

export function overallStatus(monitors: Monitor[]): "operational" | "degraded" | "outage" {
  const active = monitors.filter(m => m.status !== "paused" && m.status !== "pending")
  if (active.every(m => m.status === "up" || m.status === "maintenance")) return "operational"
  if (active.some(m => m.status === "down")) return "outage"
  return "degraded"
}
