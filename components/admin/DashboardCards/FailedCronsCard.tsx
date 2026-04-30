/**
 * components/admin/DashboardCards/FailedCronsCard.tsx — Cron failures in last 24h
 *
 * Notes:  Empty state is the happy path — "No failures" is the goal.
 */
import { formatDateShort } from "@/lib/reports/periods"

interface FailedCron {
  job_name: string
  started_at: string
  error_message: string | null
}

export function FailedCronsCard({ failed }: { failed: FailedCron[] }) {
  return (
    <div style={{
      background: "var(--paper-raised)",
      border: failed.length > 0 ? "1px solid oklch(0.55 0.18 25 / 0.4)" : "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 6",
    }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--rule)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Failed crons
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
          Last 24h
        </span>
      </div>

      {failed.length === 0 ? (
        <div style={{ padding: "16px 18px", color: "var(--positive)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <span>✓</span> All crons healthy
        </div>
      ) : (
        <div>
          {failed.map((c, i) => (
            <div key={i} style={{
              padding: "10px 18px",
              borderBottom: "1px solid var(--rule)",
              borderLeft: "3px solid var(--critical)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>
                  {c.job_name}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-mute)" }}>
                  {formatDateShort(new Date(c.started_at))}
                </span>
              </div>
              {c.error_message && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--critical)", fontFamily: "var(--mono)" }}>
                  {c.error_message.slice(0, 120)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
