"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import { Plus, AlertCircle, CheckCircle } from "lucide-react"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function CpaNoticeCell({ sent, expiringSoon }: Readonly<{ sent: boolean; expiringSoon: boolean }>) {
  if (sent) {
    return (
      <span className="flex items-center gap-1 text-green-600 text-xs">
        <CheckCircle className="size-3.5" />
        Sent
      </span>
    )
  }
  if (expiringSoon) {
    return (
      <span className="flex items-center gap-1 text-amber-600 text-xs">
        <AlertCircle className="size-3.5" />
        Due
      </span>
    )
  }
  return <span className="text-muted-foreground text-xs">—</span>
}

export default function DemoLeasesPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()
  const [now] = useState(() => Date.now())

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Leases</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.leases.length} active leases</p>
        </div>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Add Lease
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Property / Unit</th>
                  <th className="px-4 py-3 font-medium">Rent</th>
                  <th className="px-4 py-3 font-medium">Starts</th>
                  <th className="px-4 py-3 font-medium">Ends</th>
                  <th className="px-4 py-3 font-medium">Escalation</th>
                  <th className="px-4 py-3 font-medium">CPA notice</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.leases.map((lease) => {
                  const tenant = data.tenants.find((t) => t.id === lease.tenant_id)
                  const days = Math.ceil((new Date(lease.end_date).getTime() - now) / 86400000)
                  const expiringSoon = days > 0 && days <= 60
                  const arrears = data.arrears_cases.find((a) => a.lease_id === lease.id && a.status === "open")

                  return (
                    <tr
                      key={lease.id}
                      className="border-b last:border-0 hover:bg-surface-elevated transition-colors cursor-pointer"
                      onClick={showDemoToast}
                    >
                      <td className="px-4 py-3 font-medium">{tenant?.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {lease.property_name} · {lease.unit_number}
                      </td>
                      <td className="px-4 py-3">{formatZAR(lease.rent_amount_cents)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(lease.start_date)}</td>
                      <td className="px-4 py-3">
                        <span className={expiringSoon ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                          {formatDate(lease.end_date)}
                          {expiringSoon && <span className="ml-1 text-xs">({days}d)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {lease.escalation_percent}% p.a.
                      </td>
                      <td className="px-4 py-3">
                        <CpaNoticeCell sent={lease.cpa_notice_sent} expiringSoon={expiringSoon} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge className="bg-green-500/10 text-green-600 border-0 text-xs">
                            {lease.status}
                          </Badge>
                          {arrears && (
                            <Badge className="bg-red-500/10 text-red-600 border-0 text-xs">
                              arrears
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
