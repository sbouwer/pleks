/**
 * components/maintenance/DelayCard.tsx — delay event history card for maintenance detail
 *
 * Data:   delay events passed as props from server page — no data fetching
 * Notes:  Read-only. Shows all recorded delays with attribution and rescheduled dates.
 */

import { Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { fmtZA } from "@/lib/dates"

interface DelayEvent {
  id: string
  delay_type: string
  attributed_to: string
  occurred_at: string
  note: string | null
  original_date: string | null
  rescheduled_to: string | null
}

interface Props {
  delays: DelayEvent[]
}

const DELAY_TYPE_LABELS: Record<string, string> = {
  tenant_not_available:           "Tenant not available",
  tenant_rescheduled:             "Tenant rescheduled",
  tenant_no_response:             "Tenant no response",
  tenant_denied_access:           "Tenant denied access",
  contractor_no_show:             "Contractor no-show",
  contractor_rescheduled:         "Contractor rescheduled",
  contractor_no_response:         "Contractor no response",
  contractor_returned_incomplete: "Work returned incomplete",
  agent_pending_approval:         "Pending approval",
  agent_pending_quote_review:     "Pending quote review",
  agent_pending_landlord_approval:"Awaiting landlord approval",
  parts_on_order:                 "Parts on order",
  weather:                        "Weather delay",
  access_issue_other:             "Access issue",
}

const ATTRIBUTION_LABEL: Record<string, string> = {
  tenant: "Tenant",
  contractor: "Contractor",
  agent: "Agent",
  external: "External",
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return fmtZA(iso, { weekday: "short", day: "numeric", month: "short" })
}

function fmtDateTime(iso: string): string {
  return fmtZA(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function DelayCard({ delays }: Readonly<Props>) {
  if (delays.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-warning" />
          <CardTitle className="text-base font-semibold">Delays</CardTitle>
          <span className="text-xs bg-warning/15 text-warning px-1.5 py-0.5 rounded-full font-medium">{delays.length}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {delays.map((d, i) => (
            <div key={d.id} className={`text-sm ${i > 0 ? "pt-3 border-t border-border" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{DELAY_TYPE_LABELS[d.delay_type] ?? d.delay_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ATTRIBUTION_LABEL[d.attributed_to] ?? d.attributed_to} · {fmtDateTime(d.occurred_at)}
                  </p>
                </div>
              </div>
              {(d.original_date || d.rescheduled_to) && (
                <p className="text-xs text-muted-foreground mt-1">
                  {d.original_date && `Was: ${fmtDate(d.original_date)}`}
                  {d.original_date && d.rescheduled_to && " → "}
                  {d.rescheduled_to && `Now: ${fmtDate(d.rescheduled_to)}`}
                </p>
              )}
              {d.note && (
                <p className="text-xs text-muted-foreground mt-1 italic">{d.note}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
