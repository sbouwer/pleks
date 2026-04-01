import { AlertTriangle } from "lucide-react"
import { getExpiryUrgency, getExpiryColor } from "@/lib/leases/expiringLogic"

interface LeaseTimelineProps {
  startDate: string | null
  endDate: string | null
  noticePeriodDays: number
  isFixedTerm: boolean
  cpaApplies: boolean
  autoRenewalNoticeSentAt: string | null
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

export function LeaseTimeline({
  startDate,
  endDate,
  noticePeriodDays,
  isFixedTerm,
  cpaApplies,
  autoRenewalNoticeSentAt,
}: LeaseTimelineProps) {
  const now = new Date()

  let progressPct = 0
  let daysRemaining = 0
  let isExpired = false
  let color = "#378ADD"
  let s14DueDate: Date | null = null
  let s14Overdue = false

  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const total = Math.max(1, (end.getTime() - start.getTime()) / 86400000)
    const elapsed = Math.max(0, (now.getTime() - start.getTime()) / 86400000)
    progressPct = Math.min(100, Math.round((elapsed / total) * 100))
    daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))
    isExpired = end < now

    const urgency = getExpiryUrgency({ end_date: endDate, notice_period_days: noticePeriodDays })
    color = getExpiryColor(urgency)

    if (cpaApplies && isFixedTerm) {
      s14DueDate = new Date(end)
      s14DueDate.setDate(s14DueDate.getDate() - 28) // ~20 business days
      s14Overdue = !autoRenewalNoticeSentAt && now > s14DueDate
    }
  }

  // SVG ring
  const RADIUS = 34
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const dashOffset = CIRCUMFERENCE * (1 - progressPct / 100)

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Lease timeline</h3>

      {/* Progress ring */}
      <div className="mb-4 flex justify-center">
        <svg width="80" height="80" viewBox="0 0 80 80">
          {/* Track */}
          <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          {/* Progress */}
          <circle
            cx="40" cy="40" r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
          />
          {/* Center label */}
          <text
            x="40" y="38"
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            fill="currentColor"
          >
            {progressPct}%
          </text>
          <text x="40" y="52" textAnchor="middle" fontSize="9" fill="#6b7280">
            elapsed
          </text>
        </svg>
      </div>

      {/* Key dates */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Start</span>
          <span>{startDate ? fmt(new Date(startDate)) : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">End</span>
          <span>{endDate ? fmt(new Date(endDate)) : "Month to month"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Remaining</span>
          <span className="font-medium" style={{ color }}>
            {isExpired ? "Expired" : endDate ? `${daysRemaining} days` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Notice period</span>
          <span>{noticePeriodDays} business days</span>
        </div>

        {/* CPA s14 */}
        {cpaApplies && isFixedTerm && s14DueDate && (
          <div className="mt-2 border-t pt-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">s14 notice due by</span>
              <span className="font-medium">{fmt(s14DueDate)}</span>
            </div>
            {s14Overdue && !autoRenewalNoticeSentAt && (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                s14 notice overdue
              </div>
            )}
            {autoRenewalNoticeSentAt && (
              <p className="mt-1 text-[11px] text-emerald-600">
                Notice sent {fmt(new Date(autoRenewalNoticeSentAt))}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
