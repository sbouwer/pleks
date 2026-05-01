/**
 * components/admin/DashboardCards/RecentSignupsCard.tsx — Last 7 org signups
 *
 * Notes:  Shows name, tier, status, signup date. Links to /admin/orgs/[id].
 */
import { formatDateShort } from "@/lib/reports/periods"

interface SignupRow {
  id: string
  name: string
  tier: string
  status: string
  created_at: string
}

export function RecentSignupsCard({ signups }: { signups: SignupRow[] }) {
  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 6",
    }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Recent signups
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        {signups.length === 0 ? (
          <p style={{ padding: "16px 18px", color: "var(--ink-mute)", fontSize: 13 }}>No signups yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                {["Name", "Tier", "Status", "Created"].map((h) => (
                  <th key={h} style={{
                    textAlign: "left",
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--ink-mute)",
                    padding: "12px 16px 10px",
                    borderBottom: "1px solid var(--ink)",
                    fontWeight: 500,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--rule)" }}>
                    <a href={`/admin/orgs/${s.id}`} style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 500 }}>
                      {s.name}
                    </a>
                  </td>
                  <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--rule)", color: "var(--ink-soft)", textTransform: "capitalize" }}>
                    {s.tier.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--rule)", color: "var(--ink-soft)", textTransform: "capitalize" }}>
                    {s.status}
                  </td>
                  <td style={{ padding: "10px 16px", borderBottom: "1px solid var(--rule)", color: "var(--ink-soft)", fontFamily: "var(--mono)", fontSize: 11.5 }}>
                    {formatDateShort(new Date(s.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
