import Link from "next/link"
import { formatZAR, formatZARAbbrev } from "@/lib/constants"
import type { CollectionRateData } from "@/lib/dashboard/collectionRate"
import type { TrustBalanceSummary } from "@/lib/dashboard/trustBalance"
import type { FeesDueWidget } from "@/lib/dashboard/feesDue"
import type { UnpaidOwnersData } from "@/lib/dashboard/unpaidOwners"

interface FinancialsPanelProps {
  collection: CollectionRateData
  trustBalance: TrustBalanceSummary
  feesDue: FeesDueWidget
  unpaidOwners: UnpaidOwnersData
  totalLandlords: number
}

export function FinancialsPanel({
  collection,
  trustBalance,
  feesDue,
  unpaidOwners,
  totalLandlords,
}: FinancialsPanelProps) {
  const outstanding = collection.totalExpected - collection.totalCollected
  const collectionPct =
    collection.totalExpected > 0
      ? Math.round((collection.totalCollected / collection.totalExpected) * 100)
      : 0

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Financials</h2>
        <Link href="/reports" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Reports →
        </Link>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-2 divide-x divide-y">
        {/* Rent expected */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rent expected</p>
          <p className="mt-1 font-heading text-lg">{formatZAR(collection.totalExpected)}</p>
          <p className="text-[11px] text-muted-foreground">This month</p>
        </div>

        {/* Collected */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Collected</p>
          <p className="mt-1 font-heading text-lg text-emerald-600">{formatZAR(collection.totalCollected)}</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${collectionPct}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{collectionPct}% collected</p>
        </div>

        {/* Outstanding arrears */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding arrears</p>
          <p className={`mt-1 font-heading text-lg ${outstanding > 0 ? "text-red-600" : "text-muted-foreground"}`}>
            {formatZAR(outstanding)}
          </p>
          {outstanding > 0 && (
            <Link href="/payments/arrears" className="text-[11px] text-red-600 hover:underline">
              View arrears →
            </Link>
          )}
        </div>

        {/* Trust balance */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Trust balance</p>
          <p className="mt-1 font-heading text-lg">
            {formatZARAbbrev(trustBalance.total_in_trust_cents)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Deposits: {formatZARAbbrev(trustBalance.deposits_held_cents)}
            {" · "}
            Undisbursed: {formatZARAbbrev(trustBalance.rent_collected_undisbursed_cents)}
          </p>
        </div>
      </div>

      {/* Summary row */}
      <div className="flex items-center divide-x border-t">
        <div className="flex-1 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Owners not yet paid</p>
          <p className={`mt-0.5 text-sm font-semibold ${unpaidOwners.count > 0 ? "text-amber-600" : ""}`}>
            {unpaidOwners.count} of {totalLandlords}
          </p>
        </div>
        <div className="flex-1 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Management fees</p>
          <p className="mt-0.5 text-sm font-semibold">{formatZAR(feesDue.total_fees_due_cents)}</p>
        </div>
        <div className="flex-1 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Deposits held</p>
          <p className="mt-0.5 text-sm font-semibold">{formatZARAbbrev(trustBalance.deposits_held_cents)}</p>
        </div>
      </div>
    </div>
  )
}
