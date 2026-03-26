"use client"

import { Card, CardContent } from "@/components/ui/card"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import { Wallet, ShieldCheck, TrendingUp, Settings, AlertCircle, Plus } from "lucide-react"


const cards = [
  { key: "trust_balance_cents" as const, label: "Trust Balance", icon: Wallet, color: "text-brand" },
  { key: "total_deposits_held_cents" as const, label: "Deposits Held", icon: ShieldCheck, color: "text-blue-500" },
  { key: "monthly_rental_income_cents" as const, label: "Monthly Rental Income", icon: TrendingUp, color: "text-green-500" },
  { key: "management_fee_cents" as const, label: "Management Fees", icon: Settings, color: "text-muted-foreground" },
  { key: "outstanding_cents" as const, label: "Outstanding", icon: AlertCircle, color: "text-danger" },
]

export default function DemoFinancePage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl">Finance</h1>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Add Transaction
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ key, label, icon: Icon, color }) => (
          <Card key={key}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-surface-elevated p-2">
                  <Icon className={`size-5 ${color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`font-heading text-2xl ${color}`}>
                    {formatZAR(data.financials[key])}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
