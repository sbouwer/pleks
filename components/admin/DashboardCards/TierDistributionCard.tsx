/**
 * components/admin/DashboardCards/TierDistributionCard.tsx — Tier breakdown donut-style legend
 *
 * Notes:  Server-rendered bar chart. No recharts (avoids client bundle for a simple list).
 *         Donut SVG replaced with a simple proportional bar + legend for SSR simplicity.
 */

const TIER_COLORS: Record<string, string> = {
  owner_free: "var(--ink-faint)",
  steward:    "var(--ink-soft)",
  growth:     "var(--slate)",
  portfolio:  "var(--amber)",
  firm:       "var(--ink)",
  bespoke:    "oklch(0.42 0.05 135)",
}

export function TierDistributionCard({ tiers }: {
  tiers: { tier: string; count: number }[]
}) {
  const total = tiers.reduce((s, t) => s + t.count, 0)
  const sorted = [...tiers].sort((a, b) => b.count - a.count)

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 4",
    }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Tier distribution
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        {total === 0 ? (
          <p style={{ color: "var(--ink-mute)", fontSize: 13 }}>No active subscribers yet.</p>
        ) : (
          <>
            {/* Stacked bar */}
            <div style={{
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              display: "flex",
              marginBottom: 16,
              background: "var(--paper-sunk)",
            }}>
              {sorted.map((t) => (
                <div
                  key={t.tier}
                  title={`${t.tier}: ${t.count}`}
                  style={{
                    height: "100%",
                    width: `${(t.count / total) * 100}%`,
                    background: TIER_COLORS[t.tier] ?? "var(--ink-mute)",
                  }}
                />
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
              {sorted.map((t) => (
                <div key={t.tier} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    flexShrink: 0,
                    background: TIER_COLORS[t.tier] ?? "var(--ink-mute)",
                  }} />
                  <span style={{ color: "var(--ink-soft)", flex: 1, textTransform: "capitalize" }}>
                    {t.tier.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--ink)", fontFeatureSettings: '"tnum"' }}>
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
