/**
 * components/admin/DashboardCards/ConversionFunnelCard.tsx — Waitlist → trial → paid funnel
 *
 * Notes:  Horizontal bar for each stage with amber right-edge accent (design spec).
 *         Conversion rates shown as secondary label on each bar.
 */

interface FunnelData {
  waitlist: number
  trialing: number
  paid: number
  conversion_rate_pct: number
}

export function ConversionFunnelCard({ funnel }: { funnel: FunnelData }) {
  const max = Math.max(funnel.waitlist, 1)
  const stages = [
    { label: "Waitlist",    count: funnel.waitlist, rate: null },
    { label: "Trialing",    count: funnel.trialing, rate: funnel.waitlist > 0 ? Math.round((funnel.trialing / funnel.waitlist) * 100) : 0 },
    { label: "Paid",        count: funnel.paid,     rate: funnel.trialing > 0 ? Math.round((funnel.paid / funnel.trialing) * 100) : 0 },
  ]

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 6",
    }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Conversion funnel
        </span>
      </div>
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 2 }}>
        {stages.map((s) => (
          <div key={s.label} style={{
            display: "grid",
            gridTemplateColumns: "86px 1fr 60px",
            gap: 12,
            alignItems: "center",
            padding: "8px 0",
          }}>
            <span style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-soft)",
            }}>
              {s.label}
            </span>

            <div style={{
              height: 22,
              background: "var(--paper-sunk)",
              borderRadius: 3,
              overflow: "visible",
              position: "relative",
              border: "1px solid var(--rule)",
            }}>
              <div style={{
                height: "100%",
                width: `${(s.count / max) * 100}%`,
                background: "var(--ink)",
                position: "relative",
                minWidth: s.count > 0 ? 4 : 0,
              }}>
                {/* Amber right edge accent */}
                {s.count > 0 && (
                  <span style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: "var(--amber)",
                  }} />
                )}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 13,
                color: "var(--ink)",
                fontFeatureSettings: '"tnum"',
              }}>
                {s.count.toLocaleString()}
              </span>
              {s.rate !== null && (
                <div style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10.5,
                  color: "var(--amber-ink)",
                }}>
                  {s.rate}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
