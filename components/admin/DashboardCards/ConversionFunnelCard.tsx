/**
 * components/admin/DashboardCards/ConversionFunnelCard.tsx — Waitlist → trial → paid funnel
 *
 * Notes:  Recharts horizontal bar chart via ConversionChart client component.
 *         Conversion rate labels shown for each stage transition.
 */
import { ConversionChart } from "./ConversionChart"

interface FunnelData {
  waitlist: number
  trialing: number
  paid: number
  conversion_rate_pct: number
}

function pct(num: number, den: number): string {
  if (den === 0) return "0%"
  return `${Math.round((num / den) * 100)}%`
}

export function ConversionFunnelCard({ funnel }: Readonly<{ funnel: FunnelData }>) {
  const chartData = [
    { stage: "WAITLIST", count: funnel.waitlist,  rate: "" },
    { stage: "TRIALING", count: funnel.trialing,  rate: pct(funnel.trialing, funnel.waitlist) },
    { stage: "PAID",     count: funnel.paid,       rate: pct(funnel.paid, funnel.trialing) },
  ]

  const overallRate = pct(funnel.paid, funnel.waitlist)

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 4",
    }}>
      <div style={{
        padding: "14px 18px 12px",
        borderBottom: "1px solid var(--rule)",
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Conversion
        </span>
        <span style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "oklch(0.72 0.16 80)",
          fontWeight: 600,
        }}>
          {overallRate} overall
        </span>
      </div>
      <div style={{ padding: "4px 12px 14px" }}>
        <ConversionChart data={chartData} />
      </div>
    </div>
  )
}
