import Link from "next/link"
import { formatZAR } from "@/lib/constants"

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
  months_in_arrears: number
}

interface PaymentStatusProps {
  readonly leaseId: string
  readonly balanceCents: number | null
  readonly recentPayments: Payment[]
  readonly arrearsCase: ArrearsCase | null
}

export function PaymentStatus({
  leaseId,
  balanceCents,
  recentPayments,
  arrearsCase,
}: PaymentStatusProps) {
  const balance = balanceCents ?? 0
  const inArrears = balance > 0 || !!arrearsCase
  const months = arrearsCase?.months_in_arrears ?? 0
  const monthPlural = months === 1 ? "" : "s"
  const arrearsLabel = inArrears ? `${months} month${monthPlural} arrears` : "Good standing"

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Payment status</h3>
        <Link
          href={`/payments?lease=${leaseId}`}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all payments →
        </Link>
      </div>

      <div className="p-4">
        {/* Balance + standing */}
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current balance</p>
            <p className={`mt-1 font-heading text-2xl ${inArrears ? "text-red-500" : "text-emerald-600"}`}>
              {formatZAR(balance)}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              inArrears
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            }`}
          >
            {arrearsLabel}
          </span>
        </div>

        {/* Arrears case info */}
        {arrearsCase && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {formatZAR(arrearsCase.total_arrears_cents)} outstanding
            </p>
            {arrearsCase.interest_accrued_cents > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">
                + {formatZAR(arrearsCase.interest_accrued_cents)} interest accrued
              </p>
            )}
            <Link
              href={`/payments/arrears`}
              className="mt-1 block text-xs text-red-600 hover:underline dark:text-red-400"
            >
              View arrears case →
            </Link>
          </div>
        )}

        {/* Recent payments timeline */}
        {recentPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <div className="flex flex-1 items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{formatZAR(p.amount_cents)}</p>
                    <p className="text-[11px] capitalize text-muted-foreground">
                      {(p.payment_method ?? "eft").replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.payment_date).toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {p.receipt_number && (
                      <a
                        href={`/api/payments/${p.id}/receipt`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        title="View receipt"
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
  )
}
