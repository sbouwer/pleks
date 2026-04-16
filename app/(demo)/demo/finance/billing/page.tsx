"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import { Receipt, AlertTriangle, Plus } from "lucide-react"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

const STATUS_STYLES: Record<string, string> = {
  paid:    "text-green-600 bg-green-500/10",
  overdue: "text-red-600 bg-red-500/10",
  open:    "text-amber-600 bg-amber-500/10",
}

export default function DemoBillingPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  const activeArrears = data.arrears_cases.filter((a) => a.status === "open")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Billing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Invoices, payments &amp; arrears</p>
        </div>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Record Payment
        </button>
      </div>

      {/* Invoices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="size-4" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b last:border-0 hover:bg-surface-elevated transition-colors cursor-pointer"
                    onClick={showDemoToast}
                  >
                    <td className="px-4 py-3 font-medium">{inv.tenant_name}</td>
                    <td className="px-4 py-3">{formatZAR(inv.amount_cents)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={STATUS_STYLES[inv.status] ?? ""}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.due_date)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {inv.paid_date ? formatDate(inv.paid_date) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Arrears */}
      {activeArrears.length > 0 && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="size-4 text-danger" />
              Arrears Cases
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeArrears.map((ac) => (
              <div
                key={ac.id}
                className="rounded-md border p-4 space-y-3 cursor-pointer hover:bg-surface-elevated transition-colors"
                onClick={showDemoToast}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{ac.tenant_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {ac.property_name} &middot; Unit {ac.unit_number}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-red-600 bg-red-500/10">
                    {ac.days_overdue} days overdue
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Total arrears</p>
                    <p className="font-medium text-danger">{formatZAR(ac.total_arrears_cents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Interest accrued</p>
                    <p className="font-medium">{formatZAR(ac.interest_accrued_cents)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Collection step</p>
                    <p className="font-medium">Step {ac.current_step} of 5</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
