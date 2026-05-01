/**
 * components/admin/DashboardCards/MRRTrendChart.tsx — Client chart for 12-month MRR area chart
 *
 * Notes:  "use client" wrapper — recharts requires DOM. Data fetched server-side in MRRSnapshotCard.
 */
"use client"

import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts"

interface DataPoint {
  month: string
  mrr: number
}

function fmt(cents: number): string {
  const r = cents / 100
  if (r >= 1_000_000) return `R${(r / 1_000_000).toFixed(1)}m`
  if (r >= 1_000)     return `R${(r / 1_000).toFixed(0)}k`
  return `R${r.toFixed(0)}`
}

function ChartTooltip({ active, payload, label }: Readonly<{
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule-strong)",
      borderRadius: 6,
      padding: "8px 12px",
      fontSize: 12,
      fontFamily: "var(--mono)",
      color: "var(--ink)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
    }}>
      <p style={{ margin: "0 0 2px", color: "var(--ink-mute)", fontSize: 10.5, letterSpacing: "0.08em" }}>{label}</p>
      <p style={{ margin: 0, fontWeight: 600 }}>{fmt(payload[0].value)}</p>
    </div>
  )
}

export function MRRTrendChart({ data }: Readonly<{ data: DataPoint[] }>) {
  if (data.length === 0) {
    return (
      <div style={{
        height: 140,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink-faint)",
        fontSize: 13,
      }}>
        No billing history yet — data populates after the first cron run.
      </div>
    )
  }

  return (
    <div style={{ height: 140, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="oklch(0.72 0.16 80)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="oklch(0.72 0.16 80)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="oklch(0.88 0.005 260)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "oklch(0.62 0.005 260)", fontFamily: "var(--mono)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            width={48}
            tickFormatter={fmt}
            tick={{ fontSize: 10, fill: "oklch(0.62 0.005 260)", fontFamily: "var(--mono)" }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "oklch(0.72 0.16 80)", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="mrr"
            stroke="oklch(0.72 0.16 80)"
            strokeWidth={2}
            fill="url(#mrrGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "oklch(0.72 0.16 80)", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
