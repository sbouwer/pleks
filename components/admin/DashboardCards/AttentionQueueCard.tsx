/**
 * components/admin/DashboardCards/AttentionQueueCard.tsx — Unified attention queue (8-col span)
 *
 * Notes:  Shows top 10 items across feedback/contact_leads/lease_requests/trials/past-due.
 *         Sorted by severity then age. Receives pre-fetched data from getAdminDashboardData().
 */
import type { AttentionItem } from "@/lib/admin/dashboard-queries"
import { SEVERITY_COLORS, type AuditSeverity } from "@/lib/admin/audit-severity"

function severityBackground(severity: AuditSeverity): string {
  if (severity === "high")   return "var(--critical-wash)"
  if (severity === "medium") return "var(--caution-wash)"
  return "var(--slate-wash)"
}

const SOURCE_LABELS: Record<string, string> = {
  feedback:     "feedback",
  contact_lead: "contact",
  lease_request: "lease req",
  expiring_trial: "trial exp",
  past_due_sub:  "past due",
}

export function AttentionQueueCard({ items, totalCount }: {
  items: AttentionItem[]
  totalCount: number
}) {
  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 8",
    }}>
      <div style={{
        padding: "14px 18px 12px",
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--rule)",
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Attention queue
        </span>
        {totalCount > items.length && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-mute)" }}>
            Showing {items.length} of {totalCount}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "24px 18px", color: "var(--ink-mute)", fontSize: 13, textAlign: "center" }}>
          Nothing needs attention right now.
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <a
              key={`${item.source}-${item.id}`}
              href={item.deeplink}
              style={{
                display: "grid",
                gridTemplateColumns: "90px 1fr auto auto",
                gap: 14,
                alignItems: "center",
                padding: "10px 18px",
                borderBottom: "1px solid var(--rule)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
              }}>
                {SOURCE_LABELS[item.source] ?? item.source}
              </span>
              <span style={{ color: "var(--ink)", fontWeight: 500, fontSize: 13 }}>
                {item.title}
              </span>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid",
                borderColor: `color-mix(in oklch, ${SEVERITY_COLORS[item.severity]} 40%, transparent)`,
                color: SEVERITY_COLORS[item.severity],
                background: severityBackground(item.severity),
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                {item.severity}
              </span>
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--ink-mute)",
                fontFeatureSettings: '"tnum"',
                whiteSpace: "nowrap",
              }}>
                {item.source === "expiring_trial"
                  ? `${item.age_days}d left`
                  : `${item.age_days}d ago`}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
