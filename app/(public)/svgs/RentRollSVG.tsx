/**
 * app/(public)/svgs/RentRollSVG.tsx — decorative rent-roll statement line-art background for public pages
 *
 * Notes:  Presentational, aria-hidden. Amber-ink watermark; shows live current-month and previous-month-end date labels.
 */
import { fmtZA } from "@/lib/dates"

function liveDate() {
  const now = new Date()
  const month = fmtZA(now, { month: "short" }).toUpperCase()
  const year  = now.getFullYear()
  return `${month} ${year}`
}

function reconDate() {
  const now = new Date()
  // last day of previous month
  const prev = new Date(now.getFullYear(), now.getMonth(), 0)
  const dd = String(prev.getDate()).padStart(2, "0")
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  const yy = String(prev.getFullYear()).slice(2)
  return `${dd}·${mm}·${yy}`
}

export function RentRollSVG() {
  const dateLabel  = liveDate()
  const reconLabel = reconDate()

  return (
    <svg className="pub-erf-hero-bg" viewBox="0 0 300 500" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <rect x="30" y="30" width="240" height="440" rx="2" strokeDasharray="4 4"/>
      <rect x="30" y="30" width="240" height="440" fill="currentColor" fillOpacity="0.035" stroke="none"/>
      <line x1="30" y1="80" x2="270" y2="80" strokeWidth="1.2"/>
      <text x="40" y="52" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="currentColor" stroke="none">RENT ROLL</text>
      <text x="40" y="70" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" opacity="0.75" stroke="none">{dateLabel} · FOL 0417</text>
      <text x="260" y="52" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" opacity="0.7" stroke="none">FOLIO</text>
      <text x="260" y="70" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="currentColor" stroke="none">0417</text>
      {/* Column headers */}
      <text x="42"  y="97" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="currentColor" stroke="none">UNIT</text>
      <text x="108" y="97" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="currentColor" stroke="none">DUE</text>
      <text x="170" y="97" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="currentColor" stroke="none">PAID</text>
      <text x="258" y="97" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="currentColor" stroke="none">STATUS</text>
      <line x1="30" y1="103" x2="270" y2="103" strokeWidth="0.8"/>
      {/* Column dividers */}
      <line x1="96"  y1="103" x2="96"  y2="410" strokeDasharray="1 3" opacity="0.45"/>
      <line x1="158" y1="103" x2="158" y2="410" strokeDasharray="1 3" opacity="0.45"/>
      <line x1="230" y1="103" x2="230" y2="410" strokeDasharray="1 3" opacity="0.45"/>
      {/* Paid rows */}
      {([
        { y: 123, unit: "A-01", due: "9 500",  paid: "9 500"  },
        { y: 153, unit: "A-02", due: "12 000", paid: "12 000" },
        { y: 213, unit: "B-04", due: "10 750", paid: "10 750" },
        { y: 243, unit: "C-05", due: "14 200", paid: "14 200" },
        { y: 303, unit: "D-07", due: "11 800", paid: "11 800" },
        { y: 333, unit: "E-11", due: "13 500", paid: "13 500" },
        { y: 363, unit: "F-02", due: "9 200",  paid: "9 200"  },
        { y: 393, unit: "G-08", due: "10 500", paid: "10 500" },
      ] as const).map(row => (
        <g key={row.unit}>
          <text x="42"  y={row.y} fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" stroke="none">{row.unit}</text>
          <text x="108" y={row.y} fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" stroke="none">{row.due}</text>
          <text x="170" y={row.y} fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" stroke="none">{row.paid}</text>
          <circle cx="250" cy={row.y - 3} r="2.6" fill="currentColor" stroke="none"/>
          <line x1="30" y1={row.y + 10} x2="270" y2={row.y + 10} strokeDasharray="1 2" opacity="0.5"/>
        </g>
      ))}
      {/* Arrears row B-03 */}
      <rect x="30" y="163" width="240" height="30" fill="currentColor" fillOpacity="0.11" stroke="none"/>
      <text x="42"  y="183" fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" stroke="none">B-03</text>
      <text x="108" y="183" fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" stroke="none">8 200</text>
      <text x="170" y="183" fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" stroke="none">—</text>
      <circle cx="250" cy="180" r="3.4" fill="none" strokeWidth="1.2"/>
      <text x="218" y="183" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="6.5" fill="currentColor" opacity="0.75" stroke="none">d+6</text>
      <line x1="30" y1="193" x2="270" y2="193" strokeDasharray="1 2" opacity="0.5"/>
      {/* Vacant row C-06 */}
      <text x="42"  y="273" fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" opacity="0.6" stroke="none">C-06</text>
      <text x="108" y="273" fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" opacity="0.6" stroke="none">—</text>
      <text x="170" y="273" fontFamily="JetBrains Mono, monospace" fontSize="7.5" fill="currentColor" opacity="0.6" stroke="none">—</text>
      <g opacity="0.7" stroke="currentColor" strokeWidth="0.9">
        <line x1="246" y1="269" x2="254" y2="277"/>
        <line x1="254" y1="269" x2="246" y2="277"/>
      </g>
      <line x1="30" y1="283" x2="270" y2="283" strokeDasharray="1 2" opacity="0.5"/>
      {/* Totals */}
      <line x1="30" y1="410" x2="270" y2="410" strokeWidth="1.2"/>
      <text x="42"  y="427" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none">TOTAL · 10</text>
      <text x="108" y="427" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none">99 650</text>
      <text x="170" y="427" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" stroke="none">91 450</text>
      <line x1="30" y1="434" x2="270" y2="434" strokeDasharray="1 1" opacity="0.5"/>
      <text x="42" y="450" fontFamily="JetBrains Mono, monospace" fontSize="6.5" fill="currentColor" opacity="0.75" stroke="none">Trust acc · ABSA 407 889 1204</text>
      <g transform="translate(238, 452)">
        <circle r="12" fill="none" strokeWidth="0.9" strokeDasharray="2 2"/>
        <text x="0" y="-2" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none">RECON&apos;D</text>
        <text x="0" y="5"  textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill="currentColor" stroke="none">{reconLabel}</text>
      </g>
    </svg>
  )
}
