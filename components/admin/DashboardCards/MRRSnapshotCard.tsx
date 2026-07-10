/**
 * components/admin/DashboardCards/MRRSnapshotCard.tsx — MRR snapshot + 12-month area chart
 *
 * Auth:   Server component — rendered inside admin dashboard (behind requireAdminAuth)
 * Data:   platform_cost_snapshots (revenue_cents by period, last 12 months)
 *         Falls back to active subscriptions sum if no snapshot data yet.
 * Notes:  ZAR values in cents throughout. Chart rendered client-side via MRRTrendChart.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { MRRTrendChart } from "./MRRTrendChart"
import { saDateISO } from "@/lib/dates"

interface MRRData {
  current_cents: number
  previous_cents: number
  delta_pct: number
}

async function fetchMRRData(): Promise<{
  mrr: MRRData
  trend: { month: string; mrr: number }[]
}> {
  const db = await createServiceClient()

  // 12 months of platform_cost_snapshots aggregated by period
  const cutoff = new Date()
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 11)
  cutoff.setUTCDate(1)

  const [snapshotRes, subsRes] = await Promise.all([
    db.from("platform_cost_snapshots")
      .select("period, revenue_cents")
      .gte("period", saDateISO(cutoff))
      .order("period"),

    // Fallback: current active subs
    db.from("subscriptions")
      .select("amount_cents, billing_cycle")
      .eq("status", "active")
      .neq("tier", "owner"),
  ])

  // Build monthly revenue totals from snapshots
  const byPeriod = new Map<string, number>()
  for (const row of snapshotRes.data ?? []) {
    const period = row.period as string
    byPeriod.set(period, (byPeriod.get(period) ?? 0) + ((row.revenue_cents as number) ?? 0))
  }

  const periods = [...byPeriod.keys()].sort()

  // Current MRR: use most recent snapshot period, or compute from active subs
  const now = new Date()
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
  const lastMonth = (() => {
    const d = new Date(now)
    d.setUTCMonth(d.getUTCMonth() - 1)
    d.setUTCDate(1)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
  })()

  function mrrFromSubs(rows: { amount_cents: number | null; billing_cycle: string | null }[]): number {
    return rows.reduce((sum, r) => {
      const p = (r.amount_cents as number) ?? 0
      return sum + (r.billing_cycle === "annual" ? Math.round(p / 12) : p)
    }, 0)
  }

  const currentSnap  = byPeriod.get(thisMonth)
  const previousSnap = byPeriod.get(lastMonth)
  const subsMrr      = mrrFromSubs(subsRes.data ?? [])

  const current_cents  = currentSnap  ?? subsMrr
  const previous_cents = previousSnap ?? 0
  const delta_pct = previous_cents > 0
    ? Math.round(((current_cents - previous_cents) / previous_cents) * 100)
    : 0

  // Build trend array (use snapshot data; inject current-month subs-based estimate if no snapshot yet)
  const trend = periods.map((p) => ({
    month: p.slice(0, 7),
    mrr:   byPeriod.get(p) ?? 0,
  }))

  // If no snapshot for this month yet, append current subs-based MRR estimate
  if (subsMrr > 0 && (trend.length === 0 || trend[trend.length - 1].month !== thisMonth.slice(0, 7))) {
    trend.push({ month: thisMonth.slice(0, 7), mrr: subsMrr })
  }

  return { mrr: { current_cents, previous_cents, delta_pct }, trend }
}

function formatZAR(cents: number): string {
  const r = cents / 100
  if (r >= 1_000_000) return `R${(r / 1_000_000).toFixed(2)}m`
  if (r >= 1_000)     return `R${(r / 1_000).toFixed(1)}k`
  return `R${Math.round(r).toLocaleString("en-ZA")}`
}

export async function MRRSnapshotCard() {
  const { mrr, trend } = await fetchMRRData()
  const isUp = mrr.delta_pct >= 0

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 12",
    }}>
      <div style={{
        padding: "14px 18px 0",
        display: "flex",
        alignItems: "flex-start",
        gap: 32,
      }}>
        {/* Left — headline numbers */}
        <div style={{ flexShrink: 0 }}>
          <p style={{
            margin: "0 0 6px",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-mute)",
          }}>
            MRR
          </p>
          <p style={{
            margin: "0 0 8px",
            fontFamily: "var(--mono)",
            fontSize: 36,
            fontWeight: 600,
            color: "var(--ink)",
            fontFeatureSettings: '"tnum"',
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}>
            {formatZAR(mrr.current_cents)}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontFamily: "var(--mono)",
              fontSize: 12.5,
              fontWeight: 600,
              color: isUp ? "var(--positive)" : "var(--critical)",
            }}>
              {isUp ? "↑" : "↓"} {Math.abs(mrr.delta_pct)}%
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>
              vs {formatZAR(mrr.previous_cents)} last month
            </span>
          </div>
          {mrr.current_cents === 0 && (
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--ink-mute)", maxWidth: 220 }}>
              MRR will populate once a paid subscription is activated.
            </p>
          )}
        </div>

        {/* Right — trend chart */}
        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
          <MRRTrendChart data={trend} />
        </div>
      </div>

      {/* Bottom padding */}
      <div style={{ height: 16 }} />
    </div>
  )
}
