/**
 * components/admin/DashboardCards/SentryErrorsCard.tsx — Live Sentry issues via REST API
 *
 * Auth:   Server component — rendered inside admin dashboard (behind requireAdminAuth)
 * Data:   Sentry REST API — requires SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT env vars
 * Notes:  Falls back to a deeplink card if env vars are missing.
 *         Shows top 8 unresolved issues sorted by events (last 24h).
 */
interface SentryIssue {
  id: string
  title: string
  culprit: string
  count: string          // event count as string from API
  userCount: number
  level: "error" | "warning" | "info" | "fatal"
  firstSeen: string
  lastSeen: string
  permalink: string
}

const LEVEL_COLOR: Record<string, string> = {
  fatal:   "var(--critical)",
  error:   "var(--critical)",
  warning: "var(--caution)",
  info:    "var(--slate)",
}

async function fetchSentryIssues(): Promise<SentryIssue[] | null> {
  const token   = process.env.SENTRY_AUTH_TOKEN
  const org     = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT

  if (!token || !org || !project) return null

  try {
    const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&sort=date&limit=8&statsPeriod=24h`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 }, // cache 5 min
    })
    if (!res.ok) return null
    const data = await res.json() as SentryIssue[]
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

async function fetchSentryStats(): Promise<{ total24h: number; total7d: number } | null> {
  const token   = process.env.SENTRY_AUTH_TOKEN
  const org     = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  if (!token || !org || !project) return null

  try {
    const [r24, r7d] = await Promise.all([
      fetch(`https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&limit=1&statsPeriod=24h`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 300 },
      }),
      fetch(`https://sentry.io/api/0/projects/${org}/${project}/issues/?query=is:unresolved&limit=1&statsPeriod=7d`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 300 },
      }),
    ])
    const count24 = r24.ok ? parseInt(r24.headers.get("X-Hits") ?? "0", 10) : 0
    const count7d  = r7d.ok  ? parseInt(r7d.headers.get("X-Hits")  ?? "0", 10) : 0
    return { total24h: count24, total7d: count7d }
  } catch {
    return null
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h  = ms / 3_600_000
  if (h < 1)    return `${Math.round(h * 60)}m ago`
  if (h < 24)   return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

export async function SentryErrorsCard() {
  const hasConfig = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT)

  if (!hasConfig) {
    // Graceful fallback: deeplink only
    return (
      <div style={{
        background: "var(--paper-raised)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-md)",
        gridColumn: "span 4",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>Errors</span>
        </div>
        <div style={{ padding: "16px 18px", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <a
            href="https://sentry.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--rule-strong)",
              color: "var(--ink)",
              textDecoration: "none",
              fontSize: 13,
            }}
          >
            Open Sentry ↗
          </a>
          <p style={{ fontSize: 11.5, color: "var(--ink-mute)", margin: 0 }}>
            Set <code style={{ fontFamily: "var(--mono)", fontSize: 10 }}>SENTRY_AUTH_TOKEN</code>, <code style={{ fontFamily: "var(--mono)", fontSize: 10 }}>SENTRY_ORG</code>, and <code style={{ fontFamily: "var(--mono)", fontSize: 10 }}>SENTRY_PROJECT</code> in Vercel to see live issue data here.
          </p>
        </div>
      </div>
    )
  }

  const [issues, stats] = await Promise.all([fetchSentryIssues(), fetchSentryStats()])

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: (issues ?? []).some((i) => i.level === "fatal") ? "1px solid oklch(0.55 0.18 25 / 0.4)" : "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 8",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px 12px",
        borderBottom: "1px solid var(--rule)",
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Errors
        </span>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {stats && (
            <>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-mute)" }}>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{stats.total24h}</span> issues / 24h
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-mute)" }}>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{stats.total7d}</span> / 7d
              </span>
            </>
          )}
          <a
            href={`https://sentry.io/organizations/${process.env.SENTRY_ORG}/issues/`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-mute)", textDecoration: "none", letterSpacing: "0.04em" }}
          >
            Open Sentry ↗
          </a>
        </div>
      </div>

      {/* Issue list */}
      {!issues || issues.length === 0 ? (
        <div style={{ padding: "20px 18px", color: "var(--positive)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <span>✓</span> No unresolved issues in the last 24h
        </div>
      ) : (
        <div>
          {issues.map((issue) => (
            <a
              key={issue.id}
              href={issue.permalink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr auto auto",
                gap: 12,
                alignItems: "baseline",
                padding: "10px 18px",
                borderBottom: "1px solid var(--rule)",
                textDecoration: "none",
                color: "inherit",
                borderLeft: `3px solid ${LEVEL_COLOR[issue.level] ?? "var(--rule)"}`,
              }}
            >
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: LEVEL_COLOR[issue.level] ?? "var(--ink-mute)",
              }}>
                {issue.level}
              </span>
              <div style={{ minWidth: 0 }}>
                <span style={{
                  display: "block",
                  color: "var(--ink)",
                  fontWeight: 500,
                  fontSize: 12.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {issue.title}
                </span>
                {issue.culprit && (
                  <span style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--ink-mute)",
                    fontFamily: "var(--mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginTop: 1,
                  }}>
                    {issue.culprit}
                  </span>
                )}
              </div>
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--ink-mute)",
                whiteSpace: "nowrap",
                fontFeatureSettings: '"tnum"',
              }}>
                {Number(issue.count).toLocaleString()} events
              </span>
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--ink-faint)",
                whiteSpace: "nowrap",
              }}>
                {timeAgo(issue.lastSeen)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
