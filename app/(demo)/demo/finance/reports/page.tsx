"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { FileText, Download, BarChart3, Users, Building2, ShieldCheck, Wrench, Briefcase } from "lucide-react"

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  Financial:   { icon: BarChart3,    color: "text-brand" },
  Tenant:      { icon: Users,        color: "text-blue-500" },
  Property:    { icon: Building2,    color: "text-green-500" },
  Compliance:  { icon: ShieldCheck,  color: "text-purple-500" },
  Operations:  { icon: Wrench,       color: "text-amber-500" },
  Agency:      { icon: Briefcase,    color: "text-muted-foreground" },
}

const REPORT_SAMPLES = [
  { name: "Portfolio Summary — Tax Year 2025/2026", category: "Financial",  isSample: true },
  { name: "Trust Account Reconciliation",           category: "Financial",  isSample: false },
  { name: "Owner Statement — March 2026",           category: "Financial",  isSample: false },
  { name: "Tenant Arrears Report",                  category: "Tenant",    isSample: false },
  { name: "Tenant Welcome Packs",                   category: "Tenant",    isSample: false },
  { name: "Lease Expiry Schedule",                  category: "Property",  isSample: false },
  { name: "Vacancy Report",                         category: "Property",  isSample: false },
  { name: "Deposit Register",                       category: "Compliance", isSample: false },
  { name: "CPA Notice Log",                         category: "Compliance", isSample: false },
  { name: "POPIA Consent Log",                      category: "Compliance", isSample: false },
  { name: "Maintenance Summary",                    category: "Operations", isSample: false },
  { name: "Inspection Report",                      category: "Operations", isSample: false },
  { name: "Management Fee Summary",                 category: "Agency",    isSample: false },
]

export default function DemoReportsPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  function handleDownload(isSample: boolean) {
    if (isSample) {
      window.open(data.reports.sample_pdf_url, "_blank")
    } else {
      showDemoToast()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.reports.available} reports available</p>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {data.reports.categories.map((cat) => {
          const config = CATEGORY_CONFIG[cat]
          return (
            <button
              key={cat}
              onClick={showDemoToast}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium hover:bg-surface-elevated transition-colors"
            >
              {config && <config.icon className={`size-3 ${config.color}`} />}
              {cat}
            </button>
          )
        })}
      </div>

      {/* Report grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {REPORT_SAMPLES.map((report) => {
          const config = CATEGORY_CONFIG[report.category]
          const Icon = config?.icon ?? FileText
          const color = config?.color ?? "text-muted-foreground"
          return (
            <Card
              key={report.name}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="rounded-md bg-surface-elevated p-2 shrink-0">
                    <Icon className={`size-4 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{report.name}</p>
                    <Badge variant="secondary" className="mt-1 text-[10px]">{report.category}</Badge>
                    {report.isSample && (
                      <p className="text-[10px] text-brand mt-0.5">Sample PDF available</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(report.isSample)}
                  className="shrink-0 p-1.5 rounded-md hover:bg-surface-elevated transition-colors text-muted-foreground hover:text-foreground"
                  title={report.isSample ? "Download sample PDF" : "Generate report"}
                >
                  <Download className="size-4" />
                </button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
