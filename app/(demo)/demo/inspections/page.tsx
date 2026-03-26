"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { ClipboardCheck, Plus } from "lucide-react"


function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

const typeStyles: Record<string, string> = {
  incoming: "text-blue-600 bg-blue-500/10",
  outgoing: "text-amber-600 bg-amber-500/10",
  routine: "text-muted-foreground bg-muted",
}

const statusStyles: Record<string, string> = {
  complete: "text-green-600 bg-green-500/10",
  scheduled: "text-blue-600 bg-blue-500/10",
  in_progress: "text-amber-600 bg-amber-500/10",
}

export default function DemoInspectionsPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl">Inspections</h1>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Schedule Inspection
        </button>
      </div>

      <div className="grid gap-4">
        {data.inspections.map((ins) => (
          <Card key={ins.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="size-4 text-muted-foreground" />
                    <p className="font-medium">
                      {ins.property_name} &middot; Unit {ins.unit_number}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">{ins.tenant_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={typeStyles[ins.inspection_type] ?? ""}>
                    {ins.inspection_type}
                  </Badge>
                  <Badge variant="secondary" className={statusStyles[ins.status] ?? ""}>
                    {ins.status}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Scheduled</p>
                  <p>{formatDate(ins.scheduled_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p>{ins.completed_date ? formatDate(ins.completed_date) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Condition</p>
                  <p className="capitalize">{ins.overall_condition ?? "—"}</p>
                </div>
              </div>

              {ins.notes && (
                <p className="mt-3 text-sm text-muted-foreground border-t pt-3">{ins.notes}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
