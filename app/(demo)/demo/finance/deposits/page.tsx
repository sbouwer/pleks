"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import { Shield } from "lucide-react"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export default function DemoDepositsPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  const totalDeposits = data.deposits.reduce((sum, d) => sum + d.amount_cents, 0)
  const totalInterest = data.deposits.reduce((sum, d) => sum + d.interest_cents, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Deposits</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.deposits.length} deposits held in trust</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total held</p>
            <p className="font-heading text-2xl text-brand">{formatZAR(totalDeposits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Interest accrued</p>
            <p className="font-heading text-2xl text-green-600">{formatZAR(totalInterest)}</p>
          </CardContent>
        </Card>
        <Card className="hidden md:block">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Deposits count</p>
            <p className="font-heading text-2xl">{data.deposits.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Deposit register */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium">Deposit</th>
                  <th className="px-4 py-3 font-medium">Interest</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Lease ends</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.deposits.map((dep) => {
                  const days = daysUntil(dep.lease_end)
                  const urgentEnd = days <= 60
                  return (
                    <tr
                      key={dep.id}
                      className="border-b last:border-0 hover:bg-surface-elevated transition-colors cursor-pointer"
                      onClick={showDemoToast}
                    >
                      <td className="px-4 py-3 font-medium">{dep.tenant_name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{dep.unit}</td>
                      <td className="px-4 py-3">{formatZAR(dep.amount_cents)}</td>
                      <td className="px-4 py-3 text-green-600">{formatZAR(dep.interest_cents)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(dep.received)}</td>
                      <td className="px-4 py-3">
                        <span className={urgentEnd ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                          {formatDate(dep.lease_end)}
                          {urgentEnd && ` (${days}d)`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-blue-500/10 text-blue-600 border-0 flex items-center gap-1 w-fit">
                          <Shield className="size-3" />
                          In trust
                        </Badge>
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
