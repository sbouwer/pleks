import Link from "next/link"
import { AlertTriangle, ExternalLink } from "lucide-react"
import type { CalendarEvent } from "@/lib/calendar/events"

interface DeadlineAlertProps {
  alerts: CalendarEvent[]
}

const ALERT_LABELS: Record<string, string> = {
  cpa_deadline: "CPA notice missed",
  deposit_deadline: "Deposit return overdue",
  inspection_overdue: "Overdue inspection",
}

export function DeadlineAlert({ alerts }: DeadlineAlertProps) {
  if (alerts.length === 0) return null

  const cpaAlerts = alerts.filter((a) => a.eventType === "cpa_deadline")
  const depositAlerts = alerts.filter((a) => a.eventType === "deposit_deadline")
  const inspectionAlerts = alerts.filter((a) => a.eventType === "inspection_overdue")

  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 px-5 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
        <p className="text-sm font-semibold text-danger">
          {alerts.length} overdue {alerts.length === 1 ? "item" : "items"} require attention
        </p>
      </div>

      {cpaAlerts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            CPA s14 notice deadlines missed
          </p>
          {cpaAlerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <span className="text-danger font-medium">{alert.unitNumber ?? "Unit"}</span>
                {alert.propertyName && <span className="text-muted-foreground">, {alert.propertyName}</span>}
                <span className="text-muted-foreground text-xs ml-2">
                  Deadline: {new Date(alert.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
              <Link href={alert.link} className="text-xs text-brand hover:underline flex items-center gap-1 shrink-0">
                View lease <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      )}

      {depositAlerts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Deposit return deadlines overdue
          </p>
          {depositAlerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <span className="text-warning font-medium">{alert.unitNumber ?? "Unit"}</span>
                {alert.propertyName && <span className="text-muted-foreground">, {alert.propertyName}</span>}
                <span className="text-muted-foreground text-xs ml-2">
                  Deadline was: {new Date(alert.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                </span>
              </div>
              <Link href={alert.link} className="text-xs text-brand hover:underline flex items-center gap-1 shrink-0">
                View <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      )}

      {inspectionAlerts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Overdue inspections
          </p>
          {inspectionAlerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{alert.unitNumber ?? "Unit"}</span>
                {alert.propertyName && <span className="text-muted-foreground">, {alert.propertyName}</span>}
                <span className="text-muted-foreground text-xs ml-2">
                  Was scheduled: {new Date(alert.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                </span>
              </div>
              <Link href={alert.link} className="text-xs text-brand hover:underline flex items-center gap-1 shrink-0">
                View <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Suppress unused import warning — ALERT_LABELS used for future extensibility
void ALERT_LABELS
