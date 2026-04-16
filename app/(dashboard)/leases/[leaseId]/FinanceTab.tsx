import Link from "next/link"
import { formatZAR } from "@/lib/constants"
import { LeaseCharges } from "@/components/leases/LeaseCharges"

// ─────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────

export interface Payment {
  id: string
  amount_cents: number
  payment_date: string
  payment_method: string | null
  receipt_number: string | null
}

export interface ArrearsCase {
  total_arrears_cents: number
  interest_accrued_cents: number
  status: string
  months_in_arrears: number | null
}

export interface TrustTransaction {
  id: string
  direction: string
  amount_cents: number
  description: string
  created_at: string
}

interface FinanceTabProps {
  leaseId: string
  // Summary strip
  balanceCents: number | null
  lastPaymentDate: string | null
  arrearsCase: ArrearsCase | null
  // Deposit detail
  depositAmountCents: number | null
  depositReceivedAt: string | null
  depositRateDescription: string | null
  depositInterestCents: number
  depositInterestTo: string | null
  trustBankName: string | null
  // Payment history
  recentPayments: Payment[]
  // Rent schedule
  rentAmountCents: number | null
  escalationPercent: number | null
  escalationReviewDate: string | null
  paymentDueDay: number | null
  debicheckStatus: string | null
  paymentMethod: string | null
  paymentReference: string | null
  ytdCollectedCents: number
  ytdExpectedCents: number
  // Interest & charges
  arrearsCaseInterestCents: number | null
  arrearsInterestRate: number | null
  // Financial summary
  totalCollectedCents: number
  maintenanceCostCents: number
  // Trust transactions
  trustTransactions: TrustTransaction[]
}

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function daysHeld(since: string | null): number {
  if (!since) return 0
  return Math.floor((Date.now() - new Date(since).getTime()) / 86400000)
}

function collectionRateColor(rate: number): string {
  if (rate >= 95) return "text-success"
  if (rate >= 80) return "text-amber-600"
  return "text-danger"
}

function ordinalSuffix(n: number): string {
  if (n === 1) return "st"
  if (n === 2) return "nd"
  if (n === 3) return "rd"
  return "th"
}

function balanceSubtext(
  inArrears: boolean,
  months: number,
  monthLabel: string,
  lastPaymentDate: string | null,
): string {
  if (inArrears) return `${months} ${monthLabel} arrears`
  if (lastPaymentDate) return `Last payment: ${fmtDate(lastPaymentDate)}`
  return "Good standing"
}

// ─────────────────────────────────────────────────────────────
// Shared UI primitives
// ─────────────────────────────────────────────────────────────

function KvRow({ label, value, className }: Readonly<{ label: string; value: React.ReactNode; className?: string }>): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-right ${className ?? ""}`}>{value}</span>
    </div>
  )
}

function SectionLabel({ title }: Readonly<{ title: string }>) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
      {title}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components (each owns its own JSX complexity)
// ─────────────────────────────────────────────────────────────

function SummaryStrip({
  balance,
  inArrears,
  months,
  monthLabel,
  lastPaymentDate,
  depositAmountCents,
  depositReceivedAt,
  arrearsCase,
}: Readonly<{
  balance: number
  inArrears: boolean
  months: number
  monthLabel: string
  lastPaymentDate: string | null
  depositAmountCents: number | null
  depositReceivedAt: string | null
  arrearsCase: ArrearsCase | null
}>) {
  const days = daysHeld(depositReceivedAt)
  const subtext = balanceSubtext(inArrears, months, monthLabel, lastPaymentDate)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current balance</p>
        <p className={`text-xl font-heading ${inArrears ? "text-danger" : "text-success"}`}>
          {formatZAR(balance)}
        </p>
        <p className={`text-xs mt-1 ${inArrears ? "text-danger font-medium" : "text-muted-foreground"}`}>
          {subtext}
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Deposit held</p>
        <p className="text-xl font-heading">
          {depositAmountCents ? formatZAR(depositAmountCents) : "—"}
        </p>
        {depositReceivedAt && (
          <p className="text-xs text-muted-foreground mt-1">
            Since {fmtDate(depositReceivedAt)} · {days}d
          </p>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Arrears</p>
        {arrearsCase ? (
          <>
            <p className="text-xl font-heading text-danger">
              {formatZAR(arrearsCase.total_arrears_cents)}
            </p>
            <p className="text-xs text-danger mt-1">{months} {monthLabel}</p>
            <Link href="/payments/arrears" className="text-xs text-danger hover:underline mt-0.5 block">
              View arrears case →
            </Link>
          </>
        ) : (
          <p className="text-xl font-heading text-success">None</p>
        )}
      </div>
    </div>
  )
}

function PaymentHistoryCard({ leaseId, recentPayments }: Readonly<{ leaseId: string; recentPayments: Payment[] }>) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Payment history</h3>
        <Link href={`/payments?lease=${leaseId}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View all →
        </Link>
      </div>
      <div className="p-4">
        {recentPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div>
            {recentPayments.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
                <div className="flex flex-1 items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{formatZAR(p.amount_cents)}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {(p.payment_method ?? "eft").replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{fmtDate(p.payment_date)}</p>
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
  )
}

function DepositDetailCard({
  depositAmountCents,
  depositReceivedAt,
  depositRateDescription,
  depositInterestCents,
  depositInterestTo,
  trustBankName,
  netDepositCents,
}: Readonly<{
  depositAmountCents: number | null
  depositReceivedAt: string | null
  depositRateDescription: string | null
  depositInterestCents: number
  depositInterestTo: string | null
  trustBankName: string | null
  netDepositCents: number
}>) {
  const days = daysHeld(depositReceivedAt)
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Deposit detail</h3>
      </div>
      <div className="p-4">
        {!depositAmountCents ? (
          <p className="text-sm text-muted-foreground">No deposit recorded.</p>
        ) : (
          <div>
            <KvRow label="Amount held" value={formatZAR(depositAmountCents)} />
            <KvRow label="Date received" value={depositReceivedAt ? fmtDate(depositReceivedAt) : "—"} />
            <KvRow label="Days held" value={days > 0 ? `${days} days` : "—"} />
            <KvRow label="Interest rate" value={depositRateDescription ?? "—"} />
            <KvRow label="Interest accrued" value={formatZAR(depositInterestCents)} className="text-success font-medium" />
            <KvRow label="Accrued to" value={fmtDate(new Date().toISOString())} />
            <KvRow
              label="Interest payable to"
              value={depositInterestTo ? depositInterestTo.replaceAll("_", " ") : "—"}
              className="capitalize"
            />
            <KvRow label="Bank / Trust account" value={trustBankName ?? "—"} />
            <div className="my-2 border-t border-border" />
            <KvRow label="Deductions applied" value="None" className="text-muted-foreground" />
            <KvRow label="Net deposit value" value={formatZAR(netDepositCents)} className="font-semibold" />
          </div>
        )}
      </div>
    </div>
  )
}

function RentScheduleCard({
  rentAmountCents,
  escalationPercent,
  escalationReviewDate,
  rentAfterEscalation,
  paymentDueDay,
  debicheckStatus,
  paymentMethod,
  paymentReference,
  ytdCollectedCents,
  ytdExpectedCents,
  ytdRate,
}: Readonly<{
  rentAmountCents: number | null
  escalationPercent: number | null
  escalationReviewDate: string | null
  rentAfterEscalation: number | null
  paymentDueDay: number | null
  debicheckStatus: string | null
  paymentMethod: string | null
  paymentReference: string | null
  ytdCollectedCents: number
  ytdExpectedCents: number
  ytdRate: number
}>) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Rent schedule</h3>
      </div>
      <div className="p-4">
        <KvRow label="Current rent" value={rentAmountCents ? formatZAR(rentAmountCents) : "—"} className="font-medium" />
        <KvRow label="Escalation" value={escalationPercent ? `${escalationPercent}% p.a.` : "—"} />
        <KvRow label="Next escalation" value={escalationReviewDate ? fmtDate(escalationReviewDate) : "—"} />
        {rentAfterEscalation && (
          <KvRow label="Rent after escalation" value={formatZAR(rentAfterEscalation)} className="text-brand font-medium" />
        )}
        <KvRow
          label="Payment due"
          value={paymentDueDay ? `${paymentDueDay}${ordinalSuffix(paymentDueDay)} of the month` : "—"}
        />
        <KvRow label="DebiCheck" value={debicheckStatus ? debicheckStatus.replaceAll("_", " ") : "—"} className="capitalize" />
        <KvRow label="Payment method" value={paymentMethod ? paymentMethod.replaceAll("_", " ") : "—"} className="capitalize" />
        {paymentReference && (
          <KvRow label="Payment reference" value={<span className="font-mono text-[11px]">{paymentReference}</span>} />
        )}
        <div className="my-2 border-t border-border" />
        <KvRow label="YTD collected" value={formatZAR(ytdCollectedCents)} className="font-medium" />
        <KvRow label="YTD expected" value={formatZAR(ytdExpectedCents)} />
        <KvRow label="Collection rate" value={`${ytdRate}%`} className={collectionRateColor(ytdRate)} />
      </div>
    </div>
  )
}

function InterestChargesCard({
  leaseId,
  arrearsCase,
  arrearsInterestRate,
  arrearsCaseInterestCents,
  maintenanceCostCents,
}: Readonly<{
  leaseId: string
  arrearsCase: ArrearsCase | null
  arrearsInterestRate: number | null
  arrearsCaseInterestCents: number | null
  maintenanceCostCents: number
}>) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Interest &amp; charges</h3>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <SectionLabel title="Arrears interest" />
          {arrearsCase ? (
            <div>
              <KvRow label="Rate" value={arrearsInterestRate ? `Prime + ${arrearsInterestRate}%` : "—"} />
              <KvRow label="Outstanding principal" value={formatZAR(arrearsCase.total_arrears_cents)} className="text-danger" />
              <KvRow
                label="Interest accrued"
                value={formatZAR(arrearsCaseInterestCents ?? 0)}
                className={arrearsCaseInterestCents ? "text-danger" : ""}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No arrears</p>
          )}
        </div>
        <div>
          <SectionLabel title="Additional charges" />
          <LeaseCharges leaseId={leaseId} />
        </div>
        <div>
          <SectionLabel title="Maintenance costs" />
          <KvRow label="Total landlord expense (YTD)" value={maintenanceCostCents > 0 ? formatZAR(maintenanceCostCents) : "—"} />
          <KvRow label="Total charged to tenant" value="—" className="text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

function FinancialSummaryGrid({
  totalCollectedCents,
  balance,
  arrearsCase,
  depositAmountCents,
  netDepositCents,
  maintenanceCostCents,
}: Readonly<{
  totalCollectedCents: number
  balance: number
  arrearsCase: ArrearsCase | null
  depositAmountCents: number | null
  netDepositCents: number
  maintenanceCostCents: number
}>) {
  const outstanding = balance + (arrearsCase?.interest_accrued_cents ?? 0)
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Financial summary (lease to date)</h3>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border">
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total rent collected</p>
          <p className="text-lg font-heading">{formatZAR(totalCollectedCents)}</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total outstanding</p>
          <p className={`text-lg font-heading ${outstanding > 0 ? "text-danger" : "text-success"}`}>
            {formatZAR(outstanding)}
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Deposit + interest</p>
          <p className="text-lg font-heading">{depositAmountCents ? formatZAR(netDepositCents) : "—"}</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Maintenance (YTD)</p>
          <p className="text-lg font-heading">
            {maintenanceCostCents > 0 ? formatZAR(maintenanceCostCents) : "—"}
          </p>
        </div>
      </div>
    </div>
  )
}

function TrustTransactionsCard({ trustTransactions }: Readonly<{ trustTransactions: TrustTransaction[] }>) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Trust account transactions</h3>
        <Link href="/finance/trust" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          View full ledger →
        </Link>
      </div>
      <div className="p-4">
        {trustTransactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trust transactions recorded.</p>
        ) : (
          <div>
            {trustTransactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <span className={`text-xs font-mono font-semibold w-20 shrink-0 ${tx.direction === "credit" ? "text-success" : "text-danger"}`}>
                  {tx.direction === "credit" ? "+" : "−"}{formatZAR(tx.amount_cents)}
                </span>
                <div className="flex flex-1 items-center justify-between min-w-0">
                  <p className="text-xs text-foreground truncate">{tx.description}</p>
                  <p className="text-xs text-muted-foreground shrink-0 ml-2">{fmtDate(tx.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function FinanceTab({
  leaseId,
  balanceCents,
  lastPaymentDate,
  arrearsCase,
  depositAmountCents,
  depositReceivedAt,
  depositRateDescription,
  depositInterestCents,
  depositInterestTo,
  trustBankName,
  recentPayments,
  rentAmountCents,
  escalationPercent,
  escalationReviewDate,
  paymentDueDay,
  debicheckStatus,
  paymentMethod,
  paymentReference,
  ytdCollectedCents,
  ytdExpectedCents,
  arrearsCaseInterestCents,
  arrearsInterestRate,
  totalCollectedCents,
  maintenanceCostCents,
  trustTransactions,
}: Readonly<FinanceTabProps>) {
  const balance = balanceCents ?? 0
  const inArrears = balance > 0 || !!arrearsCase
  const months = arrearsCase?.months_in_arrears ?? 0
  const monthLabel = months === 1 ? "month" : "months"
  const netDepositCents = (depositAmountCents ?? 0) + depositInterestCents
  const ytdRate = ytdExpectedCents > 0 ? Math.round((ytdCollectedCents / ytdExpectedCents) * 100) : 100
  const rentAfterEscalation = rentAmountCents && escalationPercent
    ? Math.round(rentAmountCents * (1 + escalationPercent / 100))
    : null

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/payments?lease=${leaseId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          Record payment
        </Link>
        <Link
          href={`/leases/${leaseId}/statement`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          Generate statement
        </Link>
        <Link
          href={`/leases/${leaseId}/deposit`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          View deposit details
        </Link>
        {arrearsCase && (
          <Link
            href="/payments/arrears"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            View arrears case
          </Link>
        )}
      </div>

      <SummaryStrip
        balance={balance}
        inArrears={inArrears}
        months={months}
        monthLabel={monthLabel}
        lastPaymentDate={lastPaymentDate}
        depositAmountCents={depositAmountCents}
        depositReceivedAt={depositReceivedAt}
        arrearsCase={arrearsCase}
      />

      {/* Row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PaymentHistoryCard leaseId={leaseId} recentPayments={recentPayments} />
        <DepositDetailCard
          depositAmountCents={depositAmountCents}
          depositReceivedAt={depositReceivedAt}
          depositRateDescription={depositRateDescription}
          depositInterestCents={depositInterestCents}
          depositInterestTo={depositInterestTo}
          trustBankName={trustBankName}
          netDepositCents={netDepositCents}
        />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RentScheduleCard
          rentAmountCents={rentAmountCents}
          escalationPercent={escalationPercent}
          escalationReviewDate={escalationReviewDate}
          rentAfterEscalation={rentAfterEscalation}
          paymentDueDay={paymentDueDay}
          debicheckStatus={debicheckStatus}
          paymentMethod={paymentMethod}
          paymentReference={paymentReference}
          ytdCollectedCents={ytdCollectedCents}
          ytdExpectedCents={ytdExpectedCents}
          ytdRate={ytdRate}
        />
        <InterestChargesCard
          leaseId={leaseId}
          arrearsCase={arrearsCase}
          arrearsInterestRate={arrearsInterestRate}
          arrearsCaseInterestCents={arrearsCaseInterestCents}
          maintenanceCostCents={maintenanceCostCents}
        />
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FinancialSummaryGrid
          totalCollectedCents={totalCollectedCents}
          balance={balance}
          arrearsCase={arrearsCase}
          depositAmountCents={depositAmountCents}
          netDepositCents={netDepositCents}
          maintenanceCostCents={maintenanceCostCents}
        />
        <TrustTransactionsCard trustTransactions={trustTransactions} />
      </div>
    </div>
  )
}
