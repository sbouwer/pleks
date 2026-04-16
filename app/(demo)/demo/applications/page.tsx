"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { ClipboardList } from "lucide-react"

type AppStatus = "new" | "screening" | "approved" | "declined"

const STATUS_CONFIG: Record<AppStatus, { label: string; className: string }> = {
  new:       { label: "New",       className: "bg-muted text-muted-foreground" },
  screening: { label: "Screening", className: "bg-blue-500/10 text-blue-600" },
  approved:  { label: "Approved",  className: "bg-green-500/10 text-green-600" },
  declined:  { label: "Declined",  className: "bg-red-500/10 text-red-600" },
}

function fitScoreColor(score: number): string {
  if (score >= 70) return "text-green-600"
  if (score >= 50) return "text-amber-600"
  return "text-red-600"
}

function FitScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>
  const color = fitScoreColor(score)
  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${color}`}>{score}</p>
      <p className="text-[10px] text-muted-foreground">FitScore</p>
    </div>
  )
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
}

const PIPELINE: AppStatus[] = ["new", "screening", "approved", "declined"]

export default function DemoApplicationsPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Applications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.applications.length} active</p>
        </div>
      </div>

      {/* Pipeline columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PIPELINE.map((stage) => {
          const apps = data.applications.filter((a) => a.status === stage)
          const config = STATUS_CONFIG[stage]
          return (
            <div key={stage} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={`border-0 text-xs ${config.className}`}>{config.label}</Badge>
                <span className="text-xs text-muted-foreground">{apps.length}</span>
              </div>
              <div className="space-y-2">
                {apps.map((app) => (
                  <Card
                    key={app.id}
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={showDemoToast}
                  >
                    <CardContent className="pt-3 pb-3 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium leading-tight">{app.applicant}</p>
                          <p className="text-xs text-muted-foreground">{app.property} · {app.unit}</p>
                        </div>
                        <FitScoreBadge score={app.fit_score} />
                      </div>
                      {app.employer && (
                        <p className="text-xs text-muted-foreground">{app.employer}</p>
                      )}
                      {app.monthly_income_cents !== null && (
                        <p className="text-xs text-muted-foreground">
                          R {(app.monthly_income_cents / 100).toLocaleString("en-ZA")}/mo income
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">Applied {formatDate(app.applied)}</p>
                    </CardContent>
                  </Card>
                ))}
                {apps.length === 0 && (
                  <div className="rounded-lg border border-dashed flex items-center justify-center h-20">
                    <div className="text-center">
                      <ClipboardList className="size-4 text-muted-foreground/40 mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground/60">None</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
