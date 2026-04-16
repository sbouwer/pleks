"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { useState } from "react"
import { Wrench, Plus, Clock, User } from "lucide-react"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  high:   { label: "High",   className: "bg-red-500/10 text-red-600" },
  medium: { label: "Medium", className: "bg-amber-500/10 text-amber-600" },
  low:    { label: "Low",    className: "bg-muted text-muted-foreground" },
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open:        { label: "Open",        className: "bg-blue-500/10 text-blue-600" },
  in_progress: { label: "In progress", className: "bg-amber-500/10 text-amber-600" },
  complete:    { label: "Complete",    className: "bg-green-500/10 text-green-600" },
  resolved:    { label: "Resolved",    className: "bg-green-500/10 text-green-600" },
}

function SlaIndicator({ reportedDate, slaHours, status, now }: Readonly<{ reportedDate: string; slaHours: number; status: string; now: number }>) {
  if (status === "resolved" || status === "complete") return null
  const elapsed = (now - new Date(reportedDate).getTime()) / 3600000
  const breached = elapsed > slaHours
  if (breached) {
    return (
      <Badge className="bg-red-500/10 text-red-600 border-0 flex items-center gap-1">
        <Clock className="size-3" />
        SLA breached ({slaHours}h)
      </Badge>
    )
  }
  const remaining = Math.max(0, Math.round(slaHours - elapsed))
  return (
    <Badge className="bg-muted text-muted-foreground border-0 flex items-center gap-1">
      <Clock className="size-3" />
      {remaining}h SLA remaining
    </Badge>
  )
}

export default function DemoMaintenancePage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()
  const [now] = useState(() => Date.now())

  const active = data.maintenance.filter((m) => m.status !== "resolved" && m.status !== "complete")
  const completed = data.maintenance.filter((m) => m.status === "resolved" || m.status === "complete")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Maintenance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{active.length} open · {completed.length} resolved</p>
        </div>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Log Ticket
        </button>
      </div>

      {/* Active tickets */}
      <div className="space-y-3">
        {[...active, ...completed].map((ticket) => {
          const contractor = ticket.contractor_id
            ? data.suppliers.find((s) => s.id === ticket.contractor_id)
            : null
          const priorityConf = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.low
          const statusConf = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open

          return (
            <Card
              key={ticket.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={showDemoToast}
            >
              <CardContent className="pt-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Wrench className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ticket.property_name} · Unit {ticket.unit_number} · {ticket.tenant_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge className={`border-0 text-xs ${priorityConf.className}`}>{priorityConf.label}</Badge>
                    <Badge className={`border-0 text-xs ${statusConf.className}`}>{statusConf.label}</Badge>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{ticket.description}</p>

                {/* Footer */}
                <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                  <span className="text-[11px] text-muted-foreground capitalize">{ticket.category}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-[11px] text-muted-foreground">
                    Reported {daysSince(ticket.reported_date)}d ago ({formatDate(ticket.reported_date)})
                  </span>
                  {contractor && (
                    <>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="size-3" />
                        {contractor.company}
                      </span>
                    </>
                  )}
                  {!contractor && ticket.status !== "resolved" && ticket.status !== "complete" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); showDemoToast() }}
                      className="text-[11px] text-brand hover:underline"
                    >
                      Assign contractor
                    </button>
                  )}
                  <SlaIndicator
                    reportedDate={ticket.reported_date}
                    slaHours={ticket.sla_hours}
                    status={ticket.status}
                    now={now}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
