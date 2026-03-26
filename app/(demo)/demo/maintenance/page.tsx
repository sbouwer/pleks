"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { Wrench, Plus } from "lucide-react"


function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

const priorityStyles: Record<string, string> = {
  high: "text-red-600 bg-red-500/10",
  medium: "text-amber-600 bg-amber-500/10",
  low: "text-muted-foreground bg-muted",
}

const statusStyles: Record<string, string> = {
  open: "text-blue-600 bg-blue-500/10",
  in_progress: "text-amber-600 bg-amber-500/10",
  resolved: "text-green-600 bg-green-500/10",
}

export default function DemoMaintenancePage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl">Maintenance</h1>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Log Ticket
        </button>
      </div>

      <div className="grid gap-4">
        {data.maintenance.map((ticket) => (
          <Card key={ticket.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Wrench className="size-4 text-muted-foreground" />
                    <p className="font-medium">{ticket.title}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {ticket.property_name} &middot; Unit {ticket.unit_number} &middot; {ticket.tenant_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={priorityStyles[ticket.priority] ?? ""}>
                    {ticket.priority}
                  </Badge>
                  <Badge variant="secondary" className={statusStyles[ticket.status] ?? ""}>
                    {ticket.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{ticket.description}</p>

              <div className="mt-3 flex items-center gap-4 text-sm border-t pt-3">
                <div>
                  <span className="text-xs text-muted-foreground">Category: </span>
                  <span className="capitalize">{ticket.category}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Reported: </span>
                  <span>{formatDate(ticket.reported_date)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
