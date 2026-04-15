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
  partial: "#EF9F27",
  missed: "#E24B4A",
  future: "#4B5563",
}

interface TooltipPayload {
  month: string
  expected: number
  collected: number
  status: MonthBar["status"]
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: TooltipPayload }>; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-card p-2 shadow text-xs space-y-1">
      <p className="font-semibold">{label}</p>
      <p className="text-muted-foreground">Expected: {formatZAR(d.expected)}</p>
      <p>Collected: {d.collected > 0 ? formatZAR(d.collected) : "—"}</p>
    </div>
  )
}

interface CollectionChartProps {
  data: MonthBar[]
}

export function CollectionChart({ data }: CollectionChartProps) {
  const maxVal = data.reduce((m, d) => Math.max(m, d.expected, d.collected), 0)

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -28 }} barCategoryGap="20%">
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, maxVal * 1.15 || 1]} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "transparent" }} />
          <Bar dataKey="expected" fill="#374151" opacity={0.15} radius={[2, 2, 0, 0]} />
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
