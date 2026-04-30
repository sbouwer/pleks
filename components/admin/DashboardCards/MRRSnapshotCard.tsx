/**
 * components/admin/DashboardCards/MRRSnapshotCard.tsx — Current MRR + month-on-month delta
 *
 * Notes:  ZAR values in cents. MoM delta shown as positive/negative with arrow.
 */

interface MRRData {
  current_cents: number
  previous_cents: number
  delta_pct: number
}

function formatZAR(cents: number): string {
  return (cents / 100).toLocaleString("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 })
}

export function MRRSnapshotCard({ mrr }: { mrr: MRRData }) {
  const isUp = mrr.delta_pct >= 0

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 6",
    }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          MRR snapshot
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <p style={{
          fontFamily: "var(--mono)",
          fontSize: 30,
          fontWeight: 500,
          color: "var(--ink)",
          fontFeatureSettings: '"tnum"',
          letterSpacing: "-0.01em",
          lineHeight: 1,
          margin: "4px 0",
        }}>
          <span style={{ fontSize: 14, color: "var(--ink-mute)", marginRight: 6, verticalAlign: 4 }}>R</span>
          {Math.round(mrr.current_cents / 100).toLocaleString("en-ZA")}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <span style={{
            fontFamily: "var(--mono)",
            fontSize: 12,
            color: isUp ? "var(--positive)" : "var(--critical)",
          }}>
            {isUp ? "↑" : "↓"} {Math.abs(mrr.delta_pct)}% MoM
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
            vs {formatZAR(mrr.previous_cents)} last month
          </span>
        </div>

        {mrr.current_cents === 0 && (
          <p style={{ color: "var(--ink-mute)", fontSize: 12, marginTop: 8 }}>
            No active paid subscriptions yet. MRR will populate once a subscription is activated.
          </p>
        )}
      </div>
    </div>
  )
}
