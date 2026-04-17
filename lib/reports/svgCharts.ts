/**
 * Lightweight SVG chart helpers for PDF reports.
 * Returns raw SVG strings — no external dependencies.
 */

const CHART_PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

export interface ChartBar {
  label: string
  value: number
  /** Optional override colour */
  color?: string
}

export interface ChartPoint {
  label: string
  value: number
}

export interface PieSlice {
  label: string
  value: number
  color?: string
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

/**
 * Vertical bar chart SVG.
 * @param data   Array of { label, value } bars (max ~8 for readability)
 * @param width  SVG width in px (default 400)
 * @param height SVG height in px (default 160)
 * @param color  Bar fill colour (default blue)
 * @param formatValue  Optional value formatter for axis labels
 */
export function barChart(
  data: ChartBar[],
  width = 400,
  height = 160,
  color = CHART_PALETTE[0],
  formatValue?: (v: number) => string
): string {
  if (!data.length) return ""

  const padLeft = 48
  const padRight = 8
  const padTop = 12
  const padBottom = 36
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const max = Math.max(...data.map((d) => d.value), 1)
  const barW = Math.floor(chartW / data.length)
  const barGap = Math.max(2, Math.floor(barW * 0.18))
  const innerBarW = barW - barGap * 2

  const fmt = formatValue ?? ((v: number) => String(Math.round(v)))

  // Y-axis: 3 ticks at 0, 50%, 100%
  const yTicks = [0, 0.5, 1].map((t) => {
    const y = padTop + chartH - t * chartH
    const val = t * max
    return `
      <line x1="${padLeft}" y1="${y}" x2="${padLeft + chartW}" y2="${y}"
            stroke="#e2e8f0" stroke-width="1"/>
      <text x="${padLeft - 4}" y="${y + 3.5}" text-anchor="end"
            font-size="8" fill="#94a3b8">${fmt(val)}</text>`
  })

  // Bars
  const bars = data.map((d, i) => {
    const barH = Math.max(1, (d.value / max) * chartH)
    const x = padLeft + i * barW + barGap
    const y = padTop + chartH - barH
    const fill = d.color ?? color
    const labelY = padTop + chartH + 14
    const labelX = x + innerBarW / 2
    // Wrap label at ~8 chars
    const lines = wrapLabel(d.label, 10)
    const labelLines = lines
      .map((l, li) => `<text x="${labelX}" y="${labelY + li * 10}" text-anchor="middle" font-size="8" fill="#64748b">${escSvg(l)}</text>`)
      .join("")
    return `
      <rect x="${x}" y="${y}" width="${innerBarW}" height="${barH}" fill="${fill}" rx="2"/>
      ${labelLines}`
  })

  // Value labels on top of bars (if space)
  const valueLabels = data.map((d, i) => {
    const barH = Math.max(1, (d.value / max) * chartH)
    const x = padLeft + i * barW + barGap + innerBarW / 2
    const y = padTop + chartH - barH - 3
    if (barH < chartH * 0.15) return "" // skip if bar too short
    return `<text x="${x}" y="${y}" text-anchor="middle" font-size="8" fill="#475569">${fmt(d.value)}</text>`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="display:block;">
    ${yTicks.join("")}
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    ${bars.join("")}
    ${valueLabels.join("")}
  </svg>`
}

// ─── Line chart ──────────────────────────────────────────────────────────────

/**
 * Single-series line chart SVG.
 */
export function lineChart(
  data: ChartPoint[],
  width = 400,
  height = 140,
  color = CHART_PALETTE[0],
  formatValue?: (v: number) => string
): string {
  if (data.length < 2) return ""

  const padLeft = 48
  const padRight = 8
  const padTop = 12
  const padBottom = 28
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  const values = data.map((d) => d.value)
  const max = Math.max(...values, 1)
  const min = 0

  const fmt = formatValue ?? ((v: number) => String(Math.round(v)))

  const xStep = chartW / (data.length - 1)
  const toX = (i: number) => padLeft + i * xStep
  const toY = (v: number) => padTop + chartH - ((v - min) / (max - min)) * chartH

  const points = data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(" ")

  // Area fill
  const areaPoints = `${padLeft},${padTop + chartH} ${points} ${toX(data.length - 1)},${padTop + chartH}`

  // Y-axis ticks
  const yTicks = [0, 0.5, 1].map((t) => {
    const y = padTop + chartH - t * chartH
    return `
      <line x1="${padLeft}" y1="${y}" x2="${padLeft + chartW}" y2="${y}"
            stroke="#e2e8f0" stroke-width="1"/>
      <text x="${padLeft - 4}" y="${y + 3.5}" text-anchor="end"
            font-size="8" fill="#94a3b8">${fmt(t * max)}</text>`
  })

  // X labels (every point if ≤6, otherwise every other)
  const step = data.length > 6 ? 2 : 1
  const xLabels = data
    .filter((_, i) => i % step === 0)
    .map((d, idx) => {
      const i = idx * step
      return `<text x="${toX(i)}" y="${padTop + chartH + 14}" text-anchor="middle" font-size="8" fill="#64748b">${escSvg(d.label)}</text>`
    })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="display:block;">
    ${yTicks.join("")}
    <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + chartH}" stroke="#cbd5e1" stroke-width="1"/>
    <polygon points="${areaPoints}" fill="${color}" opacity="0.12"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${data.map((d, i) => `<circle cx="${toX(i)}" cy="${toY(d.value)}" r="3" fill="${color}"/>`).join("")}
    ${xLabels.join("")}
  </svg>`
}

// ─── Pie / donut chart ────────────────────────────────────────────────────────

/**
 * Donut chart SVG with optional legend.
 * @param data    Slices — each needs a label, value, optional color
 * @param size    Diameter in px (default 140)
 */
export function pieChart(
  data: PieSlice[],
  size = 140
): string {
  const nonZero = data.filter((d) => d.value > 0)
  if (!nonZero.length) return ""

  const total = nonZero.reduce((s, d) => s + d.value, 0)
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2 - 6
  const innerR = outerR * 0.55  // donut hole

  let angle = -Math.PI / 2  // start at top
  const slices = nonZero.map((d, i) => {
    const sweep = (d.value / total) * 2 * Math.PI
    const startAngle = angle
    angle += sweep
    const endAngle = angle
    const fill = d.color ?? CHART_PALETTE[i % CHART_PALETTE.length]

    const x1 = cx + outerR * Math.cos(startAngle)
    const y1 = cy + outerR * Math.sin(startAngle)
    const x2 = cx + outerR * Math.cos(endAngle)
    const y2 = cy + outerR * Math.sin(endAngle)
    const ix1 = cx + innerR * Math.cos(endAngle)
    const iy1 = cy + innerR * Math.sin(endAngle)
    const ix2 = cx + innerR * Math.cos(startAngle)
    const iy2 = cy + innerR * Math.sin(startAngle)
    const largeArc = sweep > Math.PI ? 1 : 0

    const path = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ")

    const pct = Math.round((d.value / total) * 100)
    return { path, fill, label: d.label, pct }
  })

  // Legend rows (below chart)
  const legendY = size + 6
  const legendRows = slices.map((s, i) => {
    const y = legendY + i * 14
    return `<rect x="0" y="${y}" width="9" height="9" fill="${s.fill}" rx="2"/>
            <text x="13" y="${y + 8}" font-size="9" fill="#475569">${escSvg(s.label)} (${s.pct}%)</text>`
  })

  const totalH = size + 14 * slices.length + 8

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalH}" style="display:block;">
    ${slices.map((s) => `<path d="${s.path}" fill="${s.fill}"/>`).join("")}
    ${legendRows.join("")}
  </svg>`
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function wrapLabel(label: string, maxLen: number): string[] {
  if (label.length <= maxLen) return [label]
  const words = label.split(" ")
  const lines: string[] = []
  let current = ""
  for (const w of words) {
    if ((current + " " + w).trim().length > maxLen) {
      if (current) lines.push(current.trim())
      current = w
    } else {
      current = (current + " " + w).trim()
    }
  }
  if (current) lines.push(current.trim())
  return lines.slice(0, 2)  // max 2 lines
}
