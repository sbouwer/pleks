"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { ClipboardCheck, Plus } from "lucide-react"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  move_in:  { label: "Move-in",  className: "bg-green-500/10 text-green-600" },
  move_out: { label: "Move-out", className: "bg-amber-500/10 text-amber-600" },
  periodic: { label: "Periodic", className: "bg-blue-500/10 text-blue-600" },
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  complete:  { label: "Complete",  className: "bg-green-500/10 text-green-600" },
  scheduled: { label: "Scheduled", className: "bg-blue-500/10 text-blue-600" },
  overdue:   { label: "Overdue",   className: "bg-red-500/10 text-red-600" },
}

const CONDITION_CONFIG: Record<string, string> = {
  excellent: "text-green-600",
  good:      "text-brand",
  fair:      "text-amber-600",
  poor:      "text-red-600",
}

export default function DemoInspectionsPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  const overdue    = data.inspections.filter((i) => i.status === "overdue")
  const scheduled  = data.inspections.filter((i) => i.status === "scheduled")
  const completed  = data.inspections.filter((i) => i.status === "complete")

  const ordered = [...overdue, ...scheduled, ...completed]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Inspections</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {overdue.length > 0 && <span className="text-red-600 font-medium">{overdue.length} overdue · </span>}
            {scheduled.length} scheduled · {completed.length} completed
          </p>
        </div>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Schedule
        </button>
      </div>

      <div className="grid gap-3">
        {ordered.map((ins) => {
          const typeConf   = TYPE_CONFIG[ins.inspection_type]   ?? { label: ins.inspection_type, className: "bg-muted text-muted-foreground" }
          const statusConf = STATUS_CONFIG[ins.status]          ?? { label: ins.status, className: "bg-muted text-muted-foreground" }
          const condColor  = ins.overall_condition ? (CONDITION_CONFIG[ins.overall_condition] ?? "") : ""
          const isOverdue  = ins.status === "overdue"

          return (
            <Card
              key={ins.id}
              className={`hover:shadow-md transition-shadow cursor-pointer ${isOverdue ? "border-red-500/30" : ""}`}
              onClick={showDemoToast}
            >
              <CardContent className="pt-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <ClipboardCheck className={`size-4 shrink-0 mt-0.5 ${isOverdue ? "text-red-500" : "text-muted-foreground"}`} />
                    <div>
                      <p className="font-medium text-sm">
                        {ins.property_name} · Unit {ins.unit_number}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ins.tenant_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge className={`border-0 text-xs ${typeConf.className}`}>{typeConf.label}</Badge>
                    <Badge className={`border-0 text-xs ${statusConf.className}`}>{statusConf.label}</Badge>
                  </div>
                </div>

                {/* Dates + condition */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Scheduled</p>
                    <p className={isOverdue ? "text-red-600 font-medium" : ""}>{formatDate(ins.scheduled_date)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Completed</p>
                    <p>{ins.completed_date ? formatDate(ins.completed_date) : "—"}</p>
                  </div>
                  {ins.overall_condition && (
                    <div>
                      <p className="text-muted-foreground">Condition</p>
                      <p className={`capitalize font-medium ${condColor}`}>{ins.overall_condition}</p>
                    </div>
                  )}
                </div>

                {ins.notes && (
                  <p className="text-xs text-muted-foreground border-t pt-2">{ins.notes}</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
