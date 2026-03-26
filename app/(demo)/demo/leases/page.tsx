"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import { Plus } from "lucide-react"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

export default function DemoLeasesPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()
  const [now] = useState(() => Date.now())

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl">Leases</h1>
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
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Rent</th>
                  <th className="px-4 py-3 font-medium">Start</th>
                  <th className="px-4 py-3 font-medium">End</th>
                  <th className="px-4 py-3 font-medium">Escalation</th>
                </tr>
              </thead>
              <tbody>
                {data.leases.map((lease) => {
                  const tenant = data.tenants.find((t) => t.id === lease.tenant_id)
                  const unit = data.units.find((u) => u.id === lease.unit_id)
                  const property = data.properties.find((p) => p.id === lease.property_id)
                  const daysLeft = Math.ceil(
                    (new Date(lease.end_date).getTime() - now) / (1000 * 60 * 60 * 24)
                  )
                  const expiringSoon = daysLeft > 0 && daysLeft <= 60

                  return (
                    <tr
                      key={lease.id}
                      className="border-b last:border-0 hover:bg-surface-elevated transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{tenant?.full_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {property?.name} &middot; {unit?.unit_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="text-green-600 bg-green-500/10"
                          >
                            {lease.status}
                          </Badge>
                          {expiringSoon && (
                            <Badge variant="secondary" className="text-amber-600 bg-amber-500/10">
                              {daysLeft}d left
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatZAR(lease.rent_amount_cents)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(lease.start_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(lease.end_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lease.escalation_percent}%</td>
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
