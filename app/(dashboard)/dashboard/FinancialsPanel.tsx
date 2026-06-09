/**
 * app/(dashboard)/dashboard/FinancialsPanel.tsx — dashboard financial summary (rent, collections, arrears, trust)
 *
 * Route:  /dashboard (embedded)
 * Auth:   gateway-protected dashboard layout
 * Data:   CollectionRateData + TrustBalanceSummary passed from the server page
 * Notes:  2×2 grid with explicit per-cell border-border (NOT divide-*, which defaults to currentColor in
 *         Tailwind v4 and renders dark). Management fees live on the rent-roll KPI card; owners-unpaid was
 *         dropped (it double-counted deposits + the owners figure was unreliable).
 */
import { InlineLink } from "@/components/ui/actions"
import { formatZAR, formatZARAbbrev } from "@/lib/constants"
import type { CollectionRateData } from "@/lib/dashboard/collectionRate"
import type { TrustBalanceSummary } from "@/lib/dashboard/trustBalance"

interface FinancialsPanelProps {
  collection: CollectionRateData
  trustBalance: TrustBalanceSummary
}

export function FinancialsPanel({ collection, trustBalance }: Readonly<FinancialsPanelProps>) {
  const outstanding = collection.totalExpected - collection.totalCollected
  const collectionPct =
    collection.totalExpected > 0
      ? Math.round((collection.totalCollected / collection.totalExpected) * 100)
      : 0

  return (
    <div className="overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <span className="inline-block h-0.5 w-4 shrink-0 bg-amber-400"></span>
          {"Financials"}
        </h2>
        <InlineLink href="/reports" withArrow>Reports</InlineLink>
      </div>

      {/* 2×2 grid — explicit cell borders (border-border), not divide-* */}
      <div className="grid grid-cols-2">
        {/* Rent expected */}
        <div className="border-b border-r border-border p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rent expected</p>
          <p className="mt-1 font-heading text-lg">{formatZAR(collection.totalExpected)}</p>
          <p className="text-[11px] text-muted-foreground">This month</p>
        </div>

        {/* Collected */}
        <div className="border-b border-border p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Collected</p>
          <p className="mt-1 font-heading text-lg text-emerald-600">{formatZAR(collection.totalCollected)}</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${collectionPct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{collectionPct}% collected</p>
        </div>

        {/* Outstanding arrears */}
        <div className="border-r border-border p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding arrears</p>
          <p className={`mt-1 font-heading text-lg ${outstanding > 0 ? "text-red-600" : "text-muted-foreground"}`}>
            {formatZAR(outstanding)}
          </p>
          {outstanding > 0 && (
            <InlineLink href="/billing/arrears" withArrow className="text-[11px] text-red-600">View arrears</InlineLink>
          )}
        </div>

        {/* Trust balance */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Trust balance</p>
          <p className="mt-1 font-heading text-lg">{formatZARAbbrev(trustBalance.total_in_trust_cents)}</p>
          <p className="text-[11px] text-muted-foreground">
            Deposits: {formatZARAbbrev(trustBalance.deposits_held_cents)}
            {" · "}
            Undisbursed: {formatZARAbbrev(trustBalance.rent_collected_undisbursed_cents)}
          </p>
        </div>
      </div>
    </div>
  )
}
