/**
 * components/admin/DashboardCards/PrimeRateCard.tsx — Wraps existing PrimeRateWidget
 *
 * Notes:  The existing PrimeRateWidget handles the update form. This card just wraps it
 *         in the dashboard grid with consistent card chrome.
 */
import { PrimeRateWidget } from "@/app/(admin)/admin/PrimeRateWidget"

interface PrimeRateData {
  rate_percent: number
  effective_date: string
}

export function PrimeRateCard({ primeRate }: { primeRate: PrimeRateData | null }) {
  return (
    <div style={{
      background: "var(--paper-raised)",
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 4",
    }}>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Prime rate
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <PrimeRateWidget
          currentRate={primeRate?.rate_percent ?? 11.25}
          effectiveSince={primeRate?.effective_date ?? "2024-01-01"}
        />
      </div>
    </div>
  )
}
