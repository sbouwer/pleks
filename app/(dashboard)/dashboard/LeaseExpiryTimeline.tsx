import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import type { ExpiringLease } from "@/lib/dashboard/leaseExpiry"

interface LeaseExpiryTimelineProps {
  leases: ExpiringLease[]
}

export function LeaseExpiryTimeline({ leases }: LeaseExpiryTimelineProps) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Lease expiry</h2>
      </div>

      {leases.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No leases expiring in the next 12 months.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {leases.map((lease) => (
            <li key={lease.id}>
              <Link
                href={`/leases/${lease.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                {/* Colour dot */}
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: lease.dotColor }}
                />

                {/* Unit / tenant + date range + progress */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-medium">
                      {lease.unitLabel} — {lease.tenantName}
                    </p>
                    {lease.cpaDue && (
                      <AlertTriangle
                        className="h-3.5 w-3.5 shrink-0 text-amber-500"
                        aria-label="CPA s14 notice due"
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{lease.dateRange}</p>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${lease.progressPercent}%`,
                        backgroundColor: lease.barColor,
                      }}
                    />
                  </div>
                </div>

                {/* Days remaining */}
                <div className="shrink-0 text-right">
                  {lease.isExpired ? (
                    <span className="text-[12px] font-semibold text-red-600">Expired</span>
                  ) : (
                    <span
                      className="text-[12px] font-semibold"
                      style={{ color: lease.dotColor }}
                    >
                      {lease.daysRemaining}d
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
