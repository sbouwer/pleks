"use client"

import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts"
import { formatZAR } from "@/lib/constants"

export interface MonthBar {
  month: string
  expected: number
  collected: number
  status: "collected" | "partial" | "missed" | "future"
}

const STATUS_COLOR: Record<MonthBar["status"], string> = {
  collected: "#1D9E75",
  partial:   "#EF9F27",
  missed:    "#E24B4A",
  future:    "#4B5563",
}

interface TooltipPayload {
  month: string
  expected: number
  collected: number
  status: MonthBar["status"]
}

function ChartTooltip({ active, payload, label }: Readonly<{ active?: boolean; payload?: Array<{ payload: TooltipPayload }>; label?: string }>) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-card p-2 shadow text-xs space-y-1">
      <p className="font-semibold">{label}</p>
      <p className="text-muted-foreground">Expected: {d.expected > 0 ? formatZAR(d.expected) : "—"}</p>
      <p>Collected: {d.collected > 0 ? formatZAR(d.collected) : "—"}</p>
    </div>
  )
}

// Values in the chart are in cents. Convert to rands for display.
function yAxisFormatter(valueCents: number): string {
  const r = valueCents / 100
  if (r === 0) return "R0"
  if (r >= 1000000) return `R${(r / 1000000).toFixed(1)}m`
  if (r >= 1000) {
    const k = r / 1000
    return `R${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`
  }
  return `R${r.toFixed(0)}`
}

function niceMax(rawMaxCents: number): number {
  if (rawMaxCents === 0) return 100000  // R1 000 in cents
  const padded = rawMaxCents * 1.2
  // Round up to the nearest R1 000 (= 100 000 cents)
  return Math.ceil(padded / 100000) * 100000
}

interface CollectionChartProps {
  data: MonthBar[]
}

export function CollectionChart({ data }: Readonly<CollectionChartProps>) {
  const maxVal = data.reduce((m, d) => Math.max(m, d.expected, d.collected), 0)
  const yMax = niceMax(maxVal)

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="20%">
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width={42}
            domain={[0, yMax]}
            tickFormatter={yAxisFormatter}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickCount={5}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "transparent" }} />
          <Bar dataKey="expected" fill="#378ADD" opacity={0.25} radius={[2, 2, 0, 0]} />
          <Bar dataKey="collected" radius={[2, 2, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={STATUS_COLOR[entry.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
