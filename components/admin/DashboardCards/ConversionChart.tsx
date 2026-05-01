/**
 * components/admin/DashboardCards/ConversionChart.tsx — Client recharts funnel bar chart
 *
 * Notes:  "use client" wrapper. Data from ConversionFunnelCard server component.
 */
"use client"

import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip,
  ResponsiveContainer, LabelList,
} from "recharts"

interface StageData {
  stage: string
  count: number
  rate: string
}

function ChartTooltip({ active, payload, label }: Readonly<{
  active?: boolean
  payload?: Array<{ value: number; payload: StageData }>
  label?: string
}>) {
  if (!active || !payload?.length) return null
  const d = payload[0]
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
      <p style={{ margin: "0 0 2px", color: "var(--ink-mute)", fontSize: 10, letterSpacing: "0.08em" }}>{label}</p>
      <p style={{ margin: "0 0 2px", fontWeight: 600 }}>{d.value.toLocaleString()}</p>
      {d.payload.rate && (
        <p style={{ margin: 0, color: "oklch(0.72 0.16 80)", fontSize: 11 }}>→ {d.payload.rate} conversion</p>
      )}
    </div>
  )
}

const STAGE_COLORS = [
  "oklch(0.50 0.01 260)",   // waitlist — muted ink
  "oklch(0.60 0.08 260)",   // trialing — slate-blue
  "oklch(0.72 0.16 80)",    // paid — amber
]

export function ConversionChart({ data }: Readonly<{ data: StageData[] }>) {
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div style={{ height: 140, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 52, bottom: 0, left: 56 }}
          barCategoryGap="30%"
        >
          <XAxis
            type="number"
            domain={[0, max]}
            hide
          />
          <YAxis
            type="category"
            dataKey="stage"
            width={50}
            tick={{ fontSize: 10, fill: "oklch(0.62 0.005 260)", fontFamily: "var(--mono)", letterSpacing: "0.08em" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "oklch(0.94 0.003 260 / 0.5)" }} />
          <Bar dataKey="count" radius={[0, 3, 3, 0]} minPointSize={4}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={STAGE_COLORS[index] ?? "oklch(0.62 0.005 260)"} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 12,
                fontWeight: 600,
                fill: "var(--ink)",
              }}
              formatter={(v: unknown) => typeof v === "number" ? v.toLocaleString() : String(v ?? "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
