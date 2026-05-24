/**
 * lib/reports/screening/_web/FinancialSection.tsx — Income reconciliation + expenditure analysis
 *
 * Mirrors PDF Financial Analysis section (IncomeReconciliationTable, ExpenditureTable, RiskUncertaintySplit).
 * Currently renders placeholder state — real data requires ADDENDUM_14D (bank statement intelligence).
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6, Phase F.2.
 */
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { formatZAR } from "@/lib/constants"
import { SectionLabel, PlaceholderCard } from "./shared"

export function FinancialSection({ data }: Readonly<{ data: FitScoreReportData }>) {
  const fa = data.financialAnalysis

  if (!fa) {
    return (
      <PlaceholderCard
        label="Financial Analysis"
        reason="Detailed income reconciliation and expenditure analysis are available once bank statement intelligence (ADDENDUM_14D) is enabled for this application."
      />
    )
  }

  // Shown once ADDENDUM_14D data is present
  return (
    <div className="space-y-5">
      {/* Income reconciliation */}
      <div>
        <SectionLabel>Income Reconciliation ({fa.windowLabel})</SectionLabel>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Declared income</p>
            <p className="font-semibold">{formatZAR(fa.declaredIncomeCents)}/mo</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Observed inflows</p>
            <p className="font-semibold">{formatZAR(fa.observedInflowsCents)}/mo</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Verified baseline</p>
            <p className="font-semibold">{formatZAR(fa.verifiedBaselineCents)}/mo</p>
            <p className="text-xs text-muted-foreground">{fa.evidenceTierLabel}</p>
          </div>
        </div>
        {fa.variancePct !== 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Variance: {fa.variancePct > 0 ? '+' : ''}{fa.variancePct.toFixed(1)}% between declared and verified
          </p>
        )}
      </div>

      {/* Expenditure table */}
      {fa.expenditures.length > 0 && (
        <div>
          <SectionLabel>Recurring Expenditure</SectionLabel>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-2 text-xs font-semibold text-muted-foreground">Category</th>
                  <th className="text-right p-2 text-xs font-semibold text-muted-foreground">Monthly avg</th>
                  <th className="text-right p-2 text-xs font-semibold text-muted-foreground">% income</th>
                </tr>
              </thead>
              <tbody>
                {fa.expenditures.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">{e.category}</td>
                    <td className="p-2 text-right">{formatZAR(e.monthlyAvgCents)}</td>
                    <td className="p-2 text-right text-muted-foreground">{e.incomeSharePct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Risk split */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-1">Total outflows</p>
          <p className="font-semibold">{formatZAR(fa.totalOutflowsCents)}/mo</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-1">Disposable (pre-rent)</p>
          <p className="font-semibold">{formatZAR(fa.disposableCents)}/mo</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-1">Disposable (post-rent)</p>
          <p className={`font-semibold ${fa.disposableAfterRentCents < 0 ? 'text-red-700' : ''}`}>
            {formatZAR(fa.disposableAfterRentCents)}/mo
          </p>
          <p className="text-xs text-muted-foreground">
            Rent: {fa.proposedRentPct.toFixed(1)}% of verified income
          </p>
        </div>
      </div>
    </div>
  )
}
