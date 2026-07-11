/**
 * lib/observability/betterstack.ts — Better Stack Uptime API client
 *
 * Auth:   server-only — uses BETTERSTACK_API_KEY
 * Data:   GET /api/v2/monitors, /api/v2/incidents, /api/v2/monitors/{id}/sla
 * Notes:  All functions are safe to call from ISR pages (Next.js fetch caching).
 *         Returns empty arrays on missing key or network failure — never throws.
 *         Monitor names are cleaned to strip query params (prevents token leakage).
 */

import { optionalEnv } from "@/lib/env"
const BASE = "https://uptime.betterstack.com/api/v2"

export type MonitorStatus = "up" | "down" | "paused" | "pending" | "maintenance" | "validating"

export interface DailyUptime {
  date:         string        // YYYY-MM-DD
  availability: number | null // null = unknown (before monitor existed / no data)
}

export interface Monitor {
  id:             string
  name:           string
  url:            string
  status:         MonitorStatus
  availability:   number        // all-time percentage since monitor creation
  checkFrequency: number        // seconds
  lastCheckedAt:  string | null
  createdAt:      string        // ISO — used to cap SLA requests to monitor age
  history:        DailyUptime[] // 90-day daily breakdown, oldest→newest
}

export interface BsIncident {
  id:         string
  name:       string
  startedAt:  string
  resolvedAt: string | null
  cause:      string
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
    created_at?:         string
  }
}

interface RawIncident {
  id: string
  attributes: {
    name?:        string
    url?:         string
    started_at?:  string
    resolved_at?: string | null
    cause?:       string
  }
}

interface RawSlaDay {
  id: string
  attributes: {
    from?:         string
    to?:           string
    availability?: number
  }
}

async function bsFetch<T>(path: string, revalidate = 60): Promise<T | null> {
  const key = optionalEnv("BETTERSTACK_API_KEY")
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

/**
 * Deliberately UTC, not SAST. These bound a query against BetterStack's own retention windows, which are
 * UTC — resolving them in SAST would shift the window two hours and drop the edge of a day's incidents.
 * An observability timestamp is not a legal date, so the SAST resolution the rule wants is wrong here.
 */
function dateStr(d: Date): string {
  // eslint-disable-next-line pleks/no-adhoc-dates -- intentional UTC: bounds a BetterStack UTC retention window, not a legal date (see above)
  return d.toISOString().split("T")[0]
}

// Friendly display names for known Pleks monitors, keyed by cleaned URL.
// Overrides the pronounceable_name / URL fallback from Better Stack.
const MONITOR_NAMES: Record<string, string> = {
  "pleks.co.za":                        "Marketing site",
  "app.pleks.co.za/api/health":         "Application API",
  "app.pleks.co.za/api/health/deep":    "Deep health check",
}

// Strip query params from monitor names to prevent token leakage in the UI.
// Better Stack uses the monitored URL as the default name when no pronounceable
// name is set, which can expose secrets like the health probe token.
function cleanName(raw: string): string {
  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL("https://" + raw)
    return url.hostname + (url.pathname === "/" ? "" : url.pathname)
  } catch {
    return raw
  }
}

function friendlyName(raw: string): string {
  const cleaned = cleanName(raw)
  return MONITOR_NAMES[cleaned] ?? cleaned
}

interface RawSlaResponse {
  data?: RawSlaDay[] | { attributes?: { availability?: number } }
}

interface MonitorHistoryResult {
  perDay:       DailyUptime[]
  slaAggregate: number | null  // period aggregate from BetterStack when per-day isn't available
}

function extractAggregate(json: RawSlaResponse | null): number | null {
  if (!json?.data || Array.isArray(json.data)) return null
  return (json.data as { attributes?: { availability?: number } }).attributes?.availability ?? null
}

async function fetchMonitorHistory(
  monitorId: string,
  days: number,
  createdAt: string,
): Promise<MonitorHistoryResult> {
  const to = new Date()

  // Only request days the monitor actually existed — avoids wasteful API calls
  // for days before the monitor was created (which always return null anyway).
  const monitorAge    = Math.ceil((to.getTime() - new Date(createdAt).getTime()) / 86_400_000)
  const effectiveDays = Math.min(days, monitorAge)

  // BetterStack v2 SLA endpoint always returns a single aggregate — grouped_by=day is not
  // supported. Fetch each day individually. Historical days use 24h TTL since past data
  // never changes; Next.js data cache persists across builds so subsequent builds are free.
  const dayEntries = await Promise.all(
    Array.from({ length: effectiveDays }, (_, i) => {
      const dayEnd   = new Date(to.getTime() - i       * 86_400_000)
      const dayStart = new Date(to.getTime() - (i + 1) * 86_400_000)
      const from     = dateStr(dayStart)
      const toDate   = dateStr(dayEnd)
      return bsFetch<RawSlaResponse>(
        `/monitors/${monitorId}/sla?from=${from}&to=${toDate}&_v=2`,
        86_400,  // 24h — historical day data is immutable
      ).then(json => ({ date: from, availability: extractAggregate(json) }))
    })
  )

  const byDate = new Map(dayEntries.map(e => [e.date, e.availability]))

  // Full-period aggregate for the uptime % figure — short TTL since it updates live.
  const fullFrom = dateStr(new Date(to.getTime() - days * 86_400_000))
  const fullTo   = dateStr(to)
  const fullJson = await bsFetch<RawSlaResponse>(
    `/monitors/${monitorId}/sla?from=${fullFrom}&to=${fullTo}`,
    300,
  )
  const slaAggregate = extractAggregate(fullJson)

  // Always return `days` entries so the UI always renders the full bar strip.
  // Days before the monitor existed stay null (grey bars).
  const perDay: DailyUptime[] = Array.from({ length: days }, (_, i) => {
    const d  = new Date(to.getTime() - (days - 1 - i) * 86_400_000)
    const dt = dateStr(d)
    return { date: dt, availability: byDate.get(dt) ?? null }
  })

  return { perDay, slaAggregate }
}

export async function fetchMonitors(days = 90): Promise<Monitor[]> {
  const json = await bsFetch<{ data?: RawMonitor[] }>("/monitors?per_page=50")
  if (!Array.isArray(json?.data)) return []

  // Only surface monitors with known public-facing URLs — heartbeat monitors
  // (cron jobs, internal checks) are internal-only and must not appear on the status page.
  const publicMonitors = json.data.filter(m => {
    const cleaned = cleanName(m.attributes.url ?? "")
    return Object.hasOwn(MONITOR_NAMES, cleaned)
  })

  const rawAvailability = new Map(publicMonitors.map(m => [m.id, m.attributes.availability ?? 100]))

  const monitors = publicMonitors.map(m => ({
    id:             m.id,
    name:           friendlyName(m.attributes.pronounceable_name ?? m.attributes.url ?? m.id),
    url:            cleanName(m.attributes.url ?? ""),
    status:         m.attributes.status ?? "pending" as MonitorStatus,
    availability:   m.attributes.availability ?? 100,
    checkFrequency: m.attributes.check_frequency ?? 60,
    lastCheckedAt:  m.attributes.last_checked_at ?? null,
    createdAt:      m.attributes.created_at ?? new Date().toISOString(),
    history:        [] as DailyUptime[],
  }))

  const historyResults = await Promise.all(monitors.map(m => fetchMonitorHistory(m.id, days, m.createdAt)))
  return monitors.map((m, i) => {
    const { perDay, slaAggregate } = historyResults[i]
    const known    = perDay.filter(d => d.availability !== null)
    const computed = known.length > 0
      ? known.reduce((s, d) => s + (d.availability ?? 0), 0) / known.length
      : (slaAggregate ?? rawAvailability.get(m.id) ?? 100)
    return { ...m, history: perDay, availability: computed }
  })
}

export async function fetchIncidents(days = 7, limit = 10): Promise<BsIncident[]> {
  const json = await bsFetch<{ data?: RawIncident[] }>("/incidents?per_page=25")
  if (!Array.isArray(json?.data)) return []
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return json.data
    .filter(i => {
      const d = i.attributes.started_at
      if (!d || new Date(d).getTime() <= cutoff) return false
      // Only surface incidents for public-facing monitors — heartbeats are internal
      const url = i.attributes.url ?? i.attributes.name ?? ""
      return Object.hasOwn(MONITOR_NAMES, cleanName(url))
    })
    .slice(0, limit)
    .map(i => ({
      id:         i.id,
      name:       cleanName(i.attributes.name ?? "Incident"),
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
