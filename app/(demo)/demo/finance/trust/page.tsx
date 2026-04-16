"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useDemoData } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  rent_received:    { label: "Rent received",    className: "bg-green-500/10 text-green-600" },
  expense_paid:     { label: "Expense paid",     className: "bg-red-500/10 text-red-600" },
  management_fee:   { label: "Management fee",   className: "bg-muted text-muted-foreground" },
  owner_payment:    { label: "Owner payout",     className: "bg-blue-500/10 text-blue-600" },
  deposit_received: { label: "Deposit received", className: "bg-purple-500/10 text-purple-600" },
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
}

export default function DemoTrustPage() {
  const { data } = useDemoData()

  const sorted = [...data.trust_transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Trust Ledger</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.trust_transactions.length} transactions</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Current balance</p>
          <p className="font-heading text-xl text-brand">{formatZAR(data.financials.trust_balance_cents)}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((txn) => {
                  const config = TYPE_CONFIG[txn.type] ?? { label: txn.type, className: "bg-muted text-muted-foreground" }
                  const isCredit = txn.amount_cents > 0
                  return (
                    <tr key={txn.id} className="border-b last:border-0 hover:bg-surface-elevated transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(txn.date)}</td>
                      <td className="px-4 py-3">{txn.description}</td>
                      <td className="px-4 py-3">
                        <Badge className={`border-0 text-xs ${config.className}`}>{config.label}</Badge>
                      </td>
                      <td className={`px-4 py-3 font-medium text-right whitespace-nowrap ${isCredit ? "text-green-600" : "text-red-600"}`}>
                        {isCredit ? "+" : ""}{formatZAR(txn.amount_cents)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                        {formatZAR(txn.balance_cents)}
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
