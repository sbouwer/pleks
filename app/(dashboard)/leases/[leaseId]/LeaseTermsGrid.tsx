import { formatZAR } from "@/lib/constants"

function formatDueDay(v: string): string {
  if (v === "last_day") return "Last day of each month"
  if (v === "last_working_day") return "Last working day of each month"
  const suffixes: Record<string, string> = { "1": "st", "2": "nd", "3": "rd" }
  return `${v}${suffixes[v] ?? "th"} of each month`
}

interface LeaseTermsGridProps {
  rentAmountCents: number
  depositAmountCents: number | null
  depositInterestTo: string | null
  escalationPercent: number | null
  escalationType: string | null
  escalationReviewDate: string | null
  paymentDueDay: string | null
  debicheckStatus: string | null
}

export function LeaseTermsGrid({
  rentAmountCents,
  depositAmountCents,
  depositInterestTo,
  escalationPercent,
  escalationType,
  escalationReviewDate,
  paymentDueDay,
  debicheckStatus,
}: LeaseTermsGridProps) {
  const dueDay = paymentDueDay ? formatDueDay(paymentDueDay) : "—"

  const escalationLabel = escalationPercent != null
    ? `${escalationPercent}% ${escalationType ?? ""}`.trim()
    : "—"

  const nextEscalation = escalationReviewDate
    ? new Date(escalationReviewDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
    : null

  const dcStatus = (debicheckStatus ?? "not_created").replaceAll("_", " ")

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-2 divide-x divide-y">
        {/* Monthly rent */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Monthly rent</p>
          <p className="mt-1 font-heading text-xl">{formatZAR(rentAmountCents)}</p>
        </div>

        {/* Deposit */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Deposit held</p>
          <p className="mt-1 font-heading text-xl">
            {depositAmountCents ? formatZAR(depositAmountCents) : "—"}
          </p>
          {depositInterestTo && (
            <p className="text-[11px] text-muted-foreground">
              Interest → {depositInterestTo}
            </p>
          )}
        </div>

        {/* Escalation */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Escalation</p>
          <p className="mt-1 text-base font-medium capitalize">{escalationLabel}</p>
          {nextEscalation && (
            <p className="text-[11px] text-muted-foreground">Next: {nextEscalation}</p>
          )}
        </div>

        {/* Payment due */}
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment due</p>
          <p className="mt-1 text-base font-medium">{dueDay}</p>
          <p className="text-[11px] capitalize text-muted-foreground">
            DebiCheck: {dcStatus}
          </p>
        </div>
      </div>
    </div>
  )
}
