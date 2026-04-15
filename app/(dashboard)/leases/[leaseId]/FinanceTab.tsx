import Link from "next/link"
import { formatZAR } from "@/lib/constants"
import { LeaseCharges } from "@/components/leases/LeaseCharges"

interface Payment {
  id: string
  amount_cents: number
  payment_date: string
  payment_method: string | null
  receipt_number: string | null
}

interface ArrearsCase {
  total_arrears_cents: number
  interest_accrued_cents: number
  status: string
  months_in_arrears: number | null
}

interface FinanceTabProps {
  leaseId: string
  balanceCents: number | null
  depositAmountCents: number | null
  depositInterestRate: number | null
  depositInterestTo: string | null
  arrearsCaseInterestCents: number | null
  arraysInterestRate: number | null
  recentPayments: Payment[]
  arrearsCase: ArrearsCase | null
  latestInvoiceId: string | null
}

export function FinanceTab({
  leaseId,
  balanceCents,
  depositAmountCents,
  depositInterestRate,
  depositInterestTo,
  arrearsCaseInterestCents,
  arraysInterestRate,
  recentPayments,
  arrearsCase,
  latestInvoiceId,
}: FinanceTabProps) {
  const balance = balanceCents ?? 0
  const inArrears = balance > 0 || !!arrearsCase
  const months = arrearsCase?.months_in_arrears ?? 0
  const monthLabel = months === 1 ? "month" : "months"

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/payments?lease=${leaseId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          View all payments
        </Link>
        {latestInvoiceId && (
          <Link
            href={`/payments/arrears`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            View arrears
          </Link>
        )}
        <Link
          href={`/leases/${leaseId}/deposit`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          Deposit details
        </Link>
      </div>

      {/* 3-card summary strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Current balance */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current balance</p>
          <p className={`text-xl font-heading ${inArrears ? "text-danger" : "text-success"}`}>
            {formatZAR(balance)}
          </p>
          <p className={`text-xs mt-1 font-medium ${inArrears ? "text-danger" : "text-success"}`}>
            {inArrears ? `${months} ${monthLabel} arrears` : "Good standing"}
          </p>
        </div>

        {/* Deposit held */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Deposit held</p>
          <p className="text-xl font-heading">
            {depositAmountCents ? formatZAR(depositAmountCents) : "—"}
          </p>
          {depositInterestTo && (
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              Interest → {depositInterestTo.replaceAll("_", " ")}
            </p>
          )}
        </div>

        {/* Arrears */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Arrears</p>
          {arrearsCase ? (
            <>
              <p className="text-xl font-heading text-danger">
                {formatZAR(arrearsCase.total_arrears_cents)}
              </p>
              {(arrearsCase.interest_accrued_cents ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  + {formatZAR(arrearsCase.interest_accrued_cents)} interest
                </p>
              )}
              <Link href="/payments/arrears" className="text-xs text-danger hover:underline mt-1 block">
                View case →
              </Link>
            </>
          ) : (
            <p className="text-xl font-heading text-success">None</p>
          )}
        </div>
      </div>

      {/* Two-column: payment history + interest + charges */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left: Payment history */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Payment history</h3>
            <Link
              href={`/payments?lease=${leaseId}`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all →
            </Link>
          </div>
          <div className="p-4">
            {recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {recentPayments.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
                    <div className="flex flex-1 items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{formatZAR(p.amount_cents)}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {(p.payment_method ?? "eft").replaceAll("_", " ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {new Date(p.payment_date).toLocaleDateString("en-ZA", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </p>
                        {p.receipt_number && (
                          <a
                            href={`/api/payments/${p.id}/receipt`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Receipt ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Interest settings + additional charges */}
        <div className="space-y-4">
          {(depositInterestRate != null || arraysInterestRate != null || arrearsCaseInterestCents != null) && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Interest settings</h3>
              <div className="space-y-2">
                {depositInterestRate != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deposit rate</span>
                    <span>{depositInterestRate}% p.a.</span>
                  </div>
                )}
                {arraysInterestRate != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Arrears rate</span>
                    <span>Prime + {arraysInterestRate}%</span>
                  </div>
                )}
                {(arrearsCaseInterestCents ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Interest accrued</span>
                    <span className="text-danger">{formatZAR(arrearsCaseInterestCents ?? 0)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Additional charges</h3>
            <LeaseCharges leaseId={leaseId} />
          </div>
        </div>
      </div>
    </div>
  )
}
