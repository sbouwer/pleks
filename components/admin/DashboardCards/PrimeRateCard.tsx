/**
 * components/admin/DashboardCards/PrimeRateCard.tsx — platform rates card: prime rate + Searchworx price-list import
 *
 * Notes:  The existing PrimeRateWidget handles the update form; SearchworxPriceListWidget uploads the vendor's
 *         price list (ADDENDUM_14V §3.2a). Both are platform-level rates, so they share one span-4 card rather
 *         than breaking the 12-column row arithmetic with a fifth card.
 */
import { PrimeRateWidget } from "@/app/(admin)/admin/PrimeRateWidget"
import { SearchworxPriceListWidget } from "@/app/(admin)/admin/SearchworxPriceListWidget"

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
          Platform rates
        </span>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <PrimeRateWidget
          currentRate={primeRate?.rate_percent ?? 11.25}
          effectiveSince={primeRate?.effective_date ?? "2024-01-01"}
        />
        <SearchworxPriceListWidget />
      </div>
    </div>
  )
}
